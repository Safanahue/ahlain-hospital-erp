import "server-only";
import type { User, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModulePermission } from "@/modules/auth/require-permission";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import { buildDisplayRange } from "./ranges";
import {
  createLabOrderSchema,
  updateLabOrderSchema,
  createRefRangeSchema,
  updateRefRangeSchema,
  type CreateLabOrderInput,
  type UpdateLabOrderInput,
  type CreateRefRangeInput,
  type UpdateRefRangeInput,
} from "./schemas";

async function assertCanAccessLab(actor: User) {
  await requireModulePermission(actor, "lab.access");
}

async function assertCanViewRefRanges(actor: User) {
  await requireModulePermission(actor, "lab.access");
}

async function assertCanManageRefRanges(actor: User) {
  await requireModulePermission(actor, "lab.masters");
}

function labOrderNo(year: number, value: number): string {
  return `AH-LAB-${year}-${String(value).padStart(4, "0")}`;
}

export async function createLabOrder(
  rawInput: CreateLabOrderInput,
  actor: User,
) {
  await assertCanAccessLab(actor);
  const input = createLabOrderSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "LAB", year);

    const order = await tx.labOrder.create({
      data: {
        orderNo: labOrderNo(year, seqNo),
        patientId: input.patientId,
        orderedById: input.orderedById,
        testName: input.testName,
        sampleType: input.sampleType || null,
        costPaise: Math.round(input.costRupees * 100),
        status: "ORDERED",
      },
      include: {
        patient: { select: { id: true, name: true, uhid: true, phone: true } },
        orderedBy: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_ORDER_CREATED",
      entity: "LabOrder",
      entityId: order.id,
      before: null,
      after: {
        id: order.id,
        orderNo: order.orderNo,
        patientId: order.patientId,
        testName: order.testName,
        status: order.status,
      },
    });

    return order;
  });
}

export async function listLabOrders(
  range?: { gte: Date; lt: Date },
  options?: { take?: number },
) {
  return prisma.labOrder.findMany({
    ...(range ? { where: { createdAt: range } } : {}),
    ...(options?.take ? { take: options.take } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, uhid: true, phone: true, age: true, gender: true } },
      orderedBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, category: true } },
      results: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          parameterName: true,
          resultValue: true,
          unit: true,
          referenceRange: true,
          flag: true,
        },
      },
    },
  });
}

export async function getLabOrder(id: string) {
  return prisma.labOrder.findUnique({
    where: { id },
    include: {
      patient: true,
      orderedBy: true,
      verifiedBy: true,
      template: true,
      results: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}

export async function updateLabOrder(
  id: string,
  rawInput: UpdateLabOrderInput,
  actor: User,
) {
  await assertCanAccessLab(actor);
  const input = updateLabOrderSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.labOrder.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Lab order not found");

    if (before.status === "VERIFIED" || before.status === "CANCELLED") {
      throw new ApiError(400, `Cannot modify a lab order that is already ${before.status}`);
    }

    const data: Record<string, unknown> = {
      status: input.status,
    };

    if (input.sampleType !== undefined) data.sampleType = input.sampleType || null;
    if (input.resultValue !== undefined) data.resultValue = input.resultValue || null;
    if (input.referenceRange !== undefined) data.referenceRange = input.referenceRange || null;
    if (input.findings !== undefined) data.findings = input.findings || null;

    if (input.status === "SAMPLE_COLLECTED" && !before.sampleCollectedAt) {
      data.sampleCollectedAt = new Date();
    }

    if (input.status === "VERIFIED") {
      data.verifiedById = actor.id;
      data.verifiedAt = new Date();
    }

    const updated = await tx.labOrder.update({
      where: { id },
      data,
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: `LAB_ORDER_${input.status}`,
      entity: "LabOrder",
      entityId: updated.id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Clinical Reference Ranges Management
// ---------------------------------------------------------------------------

function formatAutoDisplayRange(min?: number | null, max?: number | null, unit?: string): string | null {
  return buildDisplayRange(min, max, unit);
}

/**
 * Whole reference range library, optionally narrowed by test, category or a
 * free-text search over test and parameter names.
 */
export async function listReferenceRanges(query?: {
  testName?: string;
  serviceId?: string;
  category?: string;
  q?: string;
}) {
  const where: Prisma.LabReferenceRangeWhereInput = {};
  if (query?.testName) where.testName = query.testName;
  if (query?.serviceId) where.serviceId = query.serviceId;
  if (query?.category) where.category = query.category;
  if (query?.q) {
    where.OR = [
      { testName: { contains: query.q, mode: "insensitive" } },
      { parameterName: { contains: query.q, mode: "insensitive" } },
      { category: { contains: query.q, mode: "insensitive" } },
    ];
  }

  return prisma.labReferenceRange.findMany({
    where,
    orderBy: [
      { testName: "asc" },
      { sortOrder: "asc" },
      { parameterName: "asc" },
      { ageGroup: "asc" },
      { gender: "asc" },
    ],
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });
}

/** Distinct categories present in the library, for the filter dropdown. */
export async function listReferenceRangeCategories(): Promise<string[]> {
  const rows = await prisma.labReferenceRange.findMany({
    where: { category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category).filter((value): value is string => Boolean(value));
}

function labServiceCode(testName: string, attempt: number): string {
  const slug = testName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `LAB-${slug || "CUSTOM"}${attempt > 1 ? `-${attempt}` : ""}`;
}

/** Creates (or reuses) the LAB service catalog row for a custom test. */
async function resolveServiceForTest(
  tx: Prisma.TransactionClient,
  testName: string,
  createIfMissing: boolean,
): Promise<string | null> {
  const existing = await tx.serviceCatalog.findFirst({
    where: { name: testName, department: "LAB" },
  });
  if (existing) return existing.id;
  if (!createIfMissing) return null;

  let attempt = 1;
  while (attempt < 50) {
    const code = labServiceCode(testName, attempt);
    const clash = await tx.serviceCatalog.findUnique({ where: { code } });
    if (!clash) {
      const created = await tx.serviceCatalog.create({
        data: {
          code,
          name: testName,
          department: "LAB",
          category: "LABORATORY",
          pricePaise: 0,
        },
      });
      return created.id;
    }
    attempt += 1;
  }
  return null;
}

export async function getReferenceRange(id: string) {
  return prisma.labReferenceRange.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function createReferenceRange(rawInput: CreateRefRangeInput, actor: User) {
  await assertCanManageRefRanges(actor);
  const input = createRefRangeSchema.parse(rawInput);

  const display =
    input.displayRange?.trim() ||
    formatAutoDisplayRange(input.minValue, input.maxValue, input.unit);

  return prisma.$transaction(async (tx) => {
    const serviceId =
      input.serviceId ||
      (await resolveServiceForTest(tx, input.testName, Boolean(input.createService)));

    const range = await tx.labReferenceRange.create({
      data: {
        serviceId,
        testName: input.testName,
        parameterName: input.parameterName,
        gender: input.gender,
        ageGroup: input.ageGroup,
        minValue: input.minValue != null ? input.minValue : null,
        maxValue: input.maxValue != null ? input.maxValue : null,
        unit: input.unit,
        displayRange: display,
        category: input.category?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        notes: input.notes?.trim() || null,
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_REF_RANGE_CREATED",
      entity: "LabReferenceRange",
      entityId: range.id,
      before: null,
      after: {
        id: range.id,
        testName: range.testName,
        parameterName: range.parameterName,
        gender: range.gender,
        ageGroup: range.ageGroup,
        min: range.minValue,
        max: range.maxValue,
        unit: range.unit,
      },
    });

    return range;
  });
}

export async function updateReferenceRange(id: string, rawInput: UpdateRefRangeInput, actor: User) {
  await assertCanManageRefRanges(actor);
  const input = updateRefRangeSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.labReferenceRange.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Reference range not found");

    const newMin = input.minValue !== undefined ? input.minValue : before.minValue;
    const newMax = input.maxValue !== undefined ? input.maxValue : before.maxValue;
    const newUnit = input.unit !== undefined ? input.unit : before.unit;

    let display = input.displayRange !== undefined ? (input.displayRange?.trim() || null) : before.displayRange;
    if (!display && (newMin != null || newMax != null)) {
      display = formatAutoDisplayRange(newMin, newMax, newUnit);
    }

    const data: Prisma.LabReferenceRangeUpdateInput = {};
    if (input.parameterName !== undefined) data.parameterName = input.parameterName;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.ageGroup !== undefined) data.ageGroup = input.ageGroup;
    if (input.minValue !== undefined) data.minValue = input.minValue;
    if (input.maxValue !== undefined) data.maxValue = input.maxValue;
    if (input.unit !== undefined) data.unit = input.unit;
    data.displayRange = display;
    if (input.category !== undefined) data.category = input.category?.trim() || null;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    const updated = await tx.labReferenceRange.update({
      where: { id },
      data,
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_REF_RANGE_UPDATED",
      entity: "LabReferenceRange",
      entityId: updated.id,
      before: {
        parameterName: before.parameterName,
        gender: before.gender,
        ageGroup: before.ageGroup,
        minValue: before.minValue,
        maxValue: before.maxValue,
        unit: before.unit,
      },
      after: {
        parameterName: updated.parameterName,
        gender: updated.gender,
        ageGroup: updated.ageGroup,
        minValue: updated.minValue,
        maxValue: updated.maxValue,
        unit: updated.unit,
      },
    });

    return updated;
  });
}

export async function deleteReferenceRange(id: string, actor: User) {
  await assertCanManageRefRanges(actor);

  return prisma.$transaction(async (tx) => {
    const before = await tx.labReferenceRange.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Reference range not found");

    await tx.labReferenceRange.delete({ where: { id } });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_REF_RANGE_DELETED",
      entity: "LabReferenceRange",
      entityId: id,
      before: {
        id: before.id,
        testName: before.testName,
        parameterName: before.parameterName,
        gender: before.gender,
        ageGroup: before.ageGroup,
      },
      after: null,
    });

    return { success: true, deletedId: id };
  });
}
