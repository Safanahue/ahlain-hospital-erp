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
  labOrderListQuerySchema,
  type CreateLabOrderInput,
  type UpdateLabOrderInput,
  type CreateRefRangeInput,
  type UpdateRefRangeInput,
  type LabOrderListQuery,
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

  const tests = input.tests?.length
    ? input.tests
    : [
        {
          testName: (input.testName ?? "").trim(),
          sampleType: input.sampleType,
          department: input.department,
          priceRupees: input.costRupees,
          testCode: undefined,
          templateId: null as string | null | undefined,
        },
      ];

  return prisma.$transaction(
    async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) throw new ApiError(404, "Patient not found");

      const year = new Date().getFullYear();
      const seqNo = await nextSequence(tx, "LAB", year);
      const orderNo = labOrderNo(year, seqNo);

      const priced = tests.map((test) => ({
        ...test,
        pricePaise: Math.round(test.priceRupees * 100),
      }));
      const totalPaise = priced.reduce((sum, test) => sum + test.pricePaise, 0);
      const department = input.department || priced[0]?.department || null;
      const label = priced.map((test) => test.testName).join(", ").slice(0, 240);

      // One LAB invoice per accession, raised inside the same transaction so a
      // failed registration can never leave a bill behind.
      let invoiceId: string | null = null;
      if (input.raiseInvoice && totalPaise > 0) {
        const invoiceNo = `INV-${year}-${String(
          await nextSequence(tx, "INVOICE", year),
        ).padStart(5, "0")}`;
        const invoice = await tx.invoice.create({
          data: {
            invoiceNo,
            patientId: patient.id,
            department: "LAB",
            billType: "GENERAL",
            status: "UNPAID",
            totalAmount: totalPaise,
            paidAmount: 0,
            createdBy: actor.id,
            items: {
              create: priced.map((test) => ({
                category: "LABORATORY" as const,
                description: `${test.testName} (${orderNo})`,
                amount: test.pricePaise,
              })),
            },
          },
        });
        invoiceId = invoice.id;
        await writeAuditLog(tx, {
          userId: actor.id,
          action: "INVOICE_CREATED",
          entity: "Invoice",
          entityId: invoice.id,
          after: {
            invoiceNo,
            patientUhid: patient.uhid,
            department: "LAB",
            totalAmount: totalPaise,
            labOrderNo: orderNo,
          },
        });
      }

      const order = await tx.labOrder.create({
        data: {
          orderNo,
          reportNo: orderNo,
          patientId: input.patientId,
          orderedById: input.orderedById,
          testName: label,
          sampleType: input.sampleType || priced[0]?.sampleType || null,
          sampleId: input.sampleId || null,
          department,
          priority: input.priority,
          costPaise: totalPaise,
          status: "ORDERED",
          findings: input.notes?.trim() || null,
          templateId: priced.find((test) => test.templateId)?.templateId ?? null,
          invoiceId,
          tests: {
            create: priced.map((test, index) => ({
              testName: test.testName,
              testCode: test.testCode?.trim() || null,
              department: test.department || department,
              sampleType: test.sampleType || input.sampleType || null,
              pricePaise: test.pricePaise,
              sortOrder: index,
            })),
          },
        },
        include: {
          patient: { select: { id: true, name: true, uhid: true, phone: true } },
          orderedBy: { select: { id: true, name: true } },
          tests: { orderBy: { sortOrder: "asc" } },
          invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
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
          tests: priced.map((test) => test.testName),
          totalPaise,
          invoiceNo: order.invoice?.invoiceNo ?? null,
          status: order.status,
        },
      });

      return order;
    },
    { timeout: 15_000 },
  );
}

const LAB_ORDER_INCLUDE = {
  patient: { select: { id: true, name: true, uhid: true, phone: true, age: true, gender: true } },
  orderedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  template: { select: { id: true, name: true, category: true } },
  invoice: { select: { id: true, invoiceNo: true, totalAmount: true, paidAmount: true, status: true } },
  tests: { orderBy: { sortOrder: "asc" as const } },
  results: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      id: true,
      parameterName: true,
      resultValue: true,
      unit: true,
      referenceRange: true,
      flag: true,
    },
  },
};

/**
 * Lab register. By default every accession is listed — historical orders are
 * never hidden behind an implicit "today" filter.
 */
export async function listLabOrders(query: LabOrderListQuery = { page: 1, pageSize: 20 }) {
  const { page, pageSize, q, status, department, from, to } = labOrderListQuerySchema.parse(query);
  const where: Prisma.LabOrderWhereInput = {};

  if (status && status !== "ALL") where.status = status;
  if (department && department !== "ALL") where.department = department;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }
  if (q?.trim()) {
    const term = q.trim();
    where.OR = [
      { orderNo: { contains: term, mode: "insensitive" } },
      { reportNo: { contains: term, mode: "insensitive" } },
      { sampleId: { contains: term, mode: "insensitive" } },
      { testName: { contains: term, mode: "insensitive" } },
      { patient: { name: { contains: term, mode: "insensitive" } } },
      { patient: { uhid: { contains: term, mode: "insensitive" } } },
      { patient: { phone: { contains: term } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.labOrder.count({ where }),
    prisma.labOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: LAB_ORDER_INCLUDE,
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Dashboard counters for the lab module (all-time unless a range is given). */
export async function getLabStats() {
  const [total, ordered, collected, resultEntered, verified, cancelled, pendingBilling] =
    await Promise.all([
      prisma.labOrder.count(),
      prisma.labOrder.count({ where: { status: "ORDERED" } }),
      prisma.labOrder.count({ where: { status: "SAMPLE_COLLECTED" } }),
      prisma.labOrder.count({ where: { status: "RESULT_ENTERED" } }),
      prisma.labOrder.count({ where: { status: "VERIFIED" } }),
      prisma.labOrder.count({ where: { status: "CANCELLED" } }),
      prisma.labOrder.count({
        where: { invoice: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } } },
      }),
    ]);

  return { total, ordered, collected, resultEntered, verified, cancelled, pendingBilling };
}

export async function getLabOrder(id: string) {
  return prisma.labOrder.findUnique({
    where: { id },
    include: {
      patient: true,
      orderedBy: true,
      verifiedBy: true,
      template: true,
      tests: { orderBy: { sortOrder: "asc" } },
      invoice: { select: { id: true, invoiceNo: true, totalAmount: true, paidAmount: true, status: true } },
      documents: {
        select: { id: true, filename: true, reportNo: true, reportDate: true, matchConfidence: true },
      },
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
    if (input.sampleId !== undefined) data.sampleId = input.sampleId || null;
    if (input.resultValue !== undefined) data.resultValue = input.resultValue || null;
    if (input.referenceRange !== undefined) data.referenceRange = input.referenceRange || null;
    if (input.findings !== undefined) data.findings = input.findings || null;
    if (input.rejectionReason !== undefined) {
      data.sampleRejectionReason = input.rejectionReason || null;
      data.sampleRejectedAt = input.rejectionReason ? new Date() : null;
    }

    if (input.status === "SAMPLE_COLLECTED" && !before.sampleCollectedAt) {
      data.sampleCollectedAt = new Date();
      data.sampleCollectedBy = actor.name;
      data.sampleRejectedAt = null;
      data.sampleRejectionReason = null;
    }

    if (input.status === "VERIFIED") {
      data.verifiedById = actor.id;
      data.verifiedAt = new Date();
      data.reportNo = before.reportNo ?? before.orderNo;
    }

    const updated = await tx.labOrder.update({
      where: { id },
      data,
    });

    await tx.labOrderTest.updateMany({
      where: { orderId: id },
      data: {
        status:
          input.status === "VERIFIED"
            ? "VERIFIED"
            : input.status === "RESULT_ENTERED"
              ? "RESULT_ENTERED"
              : input.status === "CANCELLED"
                ? "CANCELLED"
                : "ORDERED",
      },
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
