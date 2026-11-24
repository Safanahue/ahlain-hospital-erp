import "server-only";
import type { ItemCategory, Prisma, Role, User } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hospitalRange } from "@/modules/shared/hospital-time";
import { authorize } from "@/modules/auth/authorize";
import { IP_BED_MANAGE_ROLES, IP_DISCHARGE_ROLES, IP_WORK_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import { formatINR } from "@/modules/shared/money";
import {
  admissionListQuerySchema,
  bedSchema,
  createAdmissionSchema,
  dischargeSchema,
  parseDateInput,
  progressNoteSchema,
  transferAdmissionSchema,
  updateAdmissionSchema,
  updateBedSchema,
  type AdmissionListQuery,
  type BedInput,
  type CreateAdmissionInput,
  type DischargeInput,
  type ProgressNoteInput,
  type TransferAdmissionInput,
  type UpdateAdmissionInput,
  type UpdateBedInput,
} from "./schemas";

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

function assertRole(actor: User, roles: Role[], message: string) {
  const result = authorize({ role: actor.role, active: actor.active }, roles);
  if (!result.ok) throw new ApiError(result.status, message);
}

function assertWork(actor: User) {
  assertRole(actor, IP_WORK_ROLES, "You do not have permission to manage inpatient admissions");
}

function assertDischarge(actor: User) {
  assertRole(actor, IP_DISCHARGE_ROLES, "Only doctors, billing staff and admins can discharge patients");
}

function assertBedManage(actor: User) {
  assertRole(actor, IP_BED_MANAGE_ROLES, "Only admin and reception can maintain the bed master");
}

/** Parses a form date, converting bad input into a 400 instead of a crash. */
function parseDate(value: string | null | undefined, label: string): Date | null {
  try {
    return parseDateInput(value, label);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : `${label} is not a valid date`);
  }
}

/**
 * Number of billed days for a stay, inclusive of both admission and discharge
 * dates (a same-day admission/discharge counts as 1 day).
 */
export function computeStayDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

export function admissionNo(year: number, value: number): string {
  return `AH-IP-${year}-${String(value).padStart(4, "0")}`;
}

async function assertDoctor(tx: Tx, userId: string, label: string) {
  const doctor = await tx.user.findUnique({ where: { id: userId } });
  if (!doctor || !doctor.active || doctor.role !== "DOCTOR") {
    throw new ApiError(400, `Selected ${label} is not an active doctor`);
  }
  return doctor;
}

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export async function createAdmission(rawInput: CreateAdmissionInput, actor: User) {
  assertWork(actor);
  const input = createAdmissionSchema.parse(rawInput);
  const admissionDate = parseDate(input.admissionDate, "Admission date") ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) throw new ApiError(404, "Patient not found");

      await assertDoctor(tx, input.admittingDoctorId, "admitting doctor");
      const attendingDoctorId = input.attendingDoctorId || input.admittingDoctorId;
      if (input.attendingDoctorId) {
        await assertDoctor(tx, input.attendingDoctorId, "attending doctor");
      }

      const bed = await tx.bed.findUnique({ where: { id: input.bedId } });
      if (!bed) throw new ApiError(404, "Bed not found");
      if (bed.status !== "AVAILABLE") {
        throw new ApiError(409, `Bed ${bed.bedNumber} is ${bed.status.toLowerCase()} and cannot be allotted`);
      }

      const active = await tx.admission.findFirst({
        where: { patientId: patient.id, status: "ADMITTED" },
      });
      if (active) {
        throw new ApiError(
          409,
          `Patient already has an active admission (${active.admissionNo}). Discharge it before admitting again.`,
        );
      }

      const year = admissionDate.getUTCFullYear();
      const seqNo = await nextSequence(tx, "IP", year);

      const admission = await tx.admission.create({
        data: {
          admissionNo: admissionNo(year, seqNo),
          patientId: patient.id,
          admittingDoctorId: input.admittingDoctorId,
          attendingDoctorId,
          bedId: bed.id,
          ward: bed.ward,
          diagnosis: input.diagnosis,
          admissionDate,
          status: "ADMITTED",
        },
        include: {
          patient: { select: { id: true, uhid: true, name: true, age: true, gender: true } },
          bed: true,
          admittingDoctor: { select: { id: true, name: true } },
          attendingDoctor: { select: { id: true, name: true } },
        },
      });

      await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "ADMISSION_CREATED",
        entity: "Admission",
        entityId: admission.id,
        before: null,
        after: {
          admissionNo: admission.admissionNo,
          patientUhid: patient.uhid,
          bedNumber: bed.bedNumber,
          ward: bed.ward,
          admittingDoctorId: admission.admittingDoctorId,
          attendingDoctorId: admission.attendingDoctorId,
          status: admission.status,
        },
      });

      return admission;
    });
  } catch (error) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "This bed was just allotted to another patient. Pick a different bed.");
    }
    throw error;
  }
}

const admissionListInclude = {
  patient: {
    select: { id: true, uhid: true, name: true, phone: true, age: true, gender: true },
  },
  bed: { select: { id: true, bedNumber: true, ward: true, roomNo: true, floor: true, dailyRatePaise: true } },
  admittingDoctor: { select: { id: true, name: true } },
  attendingDoctor: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true } },
} satisfies Prisma.AdmissionInclude;

export async function listAdmissions(rawQuery: unknown): Promise<{
  items: Prisma.AdmissionGetPayload<{ include: typeof admissionListInclude }>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const parsed = admissionListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.flatten().fieldErrors);
  }
  const query: AdmissionListQuery = parsed.data;

  const where: Prisma.AdmissionWhereInput = {};
  if (query.status && query.status !== "ALL") where.status = query.status;
  if (query.ward) where.ward = query.ward;
  if (query.from || query.to) {
    const from = query.from ?? (query.to as string);
    const to = query.to ?? (query.from as string);
    where.admissionDate = hospitalRange(from, to);
  }
  if (query.q) {
    where.OR = [
      { admissionNo: { contains: query.q, mode: "insensitive" } },
      { patient: { name: { contains: query.q, mode: "insensitive" } } },
      { patient: { uhid: { contains: query.q, mode: "insensitive" } } },
      { patient: { phone: { contains: query.q } } },
      { bed: { bedNumber: { contains: query.q, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.admission.count({ where }),
    prisma.admission.findMany({
      where,
      include: admissionListInclude,
      orderBy: [{ status: "asc" }, { admissionDate: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getAdmission(id: string) {
  return prisma.admission.findUnique({
    where: { id },
    include: {
      patient: true,
      bed: true,
      admittingDoctor: { select: { id: true, name: true } },
      attendingDoctor: { select: { id: true, name: true } },
      dischargedBy: { select: { id: true, name: true } },
      invoice: {
        select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
      },
      transfers: {
        include: {
          fromBed: { select: { id: true, bedNumber: true, ward: true, roomNo: true } },
          toBed: { select: { id: true, bedNumber: true, ward: true, roomNo: true } },
          transferredBy: { select: { id: true, name: true } },
        },
        orderBy: { transferredAt: "desc" },
      },
      progressNotes: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
      },
      nursingNotes: {
        include: { nurse: { select: { id: true, name: true } } },
        orderBy: { recordedAt: "desc" },
        take: 20,
      },
    },
  });
}

/** Assigns / reassigns the treating doctor and can correct the diagnosis. */
export async function updateAdmission(
  id: string,
  rawInput: UpdateAdmissionInput,
  actor: User,
) {
  assertWork(actor);
  const input = updateAdmissionSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.admission.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Admission not found");

    if (input.attendingDoctorId) {
      await assertDoctor(tx, input.attendingDoctorId, "attending doctor");
    }

    const updated = await tx.admission.update({
      where: { id },
      data: {
        ...(input.attendingDoctorId !== undefined
          ? { attendingDoctorId: input.attendingDoctorId || null }
          : {}),
        ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
      },
      include: {
        bed: true,
        attendingDoctor: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action:
        input.attendingDoctorId !== undefined ? "ADMISSION_DOCTOR_ASSIGNED" : "ADMISSION_UPDATED",
      entity: "Admission",
      entityId: id,
      before: { attendingDoctorId: before.attendingDoctorId, diagnosis: before.diagnosis },
      after: { attendingDoctorId: updated.attendingDoctorId, diagnosis: updated.diagnosis },
    });

    return updated;
  });
}

/** Moves an admitted patient to another bed/ward and frees the old bed. */
export async function transferAdmission(
  id: string,
  rawInput: TransferAdmissionInput,
  actor: User,
) {
  assertWork(actor);
  const input = transferAdmissionSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const admission = await tx.admission.findUnique({
      where: { id },
      include: { bed: true },
    });
    if (!admission) throw new ApiError(404, "Admission not found");
    if (admission.status !== "ADMITTED") {
      throw new ApiError(409, "Only an admitted patient can be transferred");
    }
    if (admission.bedId === input.toBedId) {
      throw new ApiError(400, "Choose a different bed for the transfer");
    }

    const toBed = await tx.bed.findUnique({ where: { id: input.toBedId } });
    if (!toBed) throw new ApiError(404, "Destination bed not found");
    if (toBed.status !== "AVAILABLE") {
      throw new ApiError(409, `Bed ${toBed.bedNumber} is ${toBed.status.toLowerCase()} and cannot be allotted`);
    }

    const transfer = await tx.bedTransfer.create({
      data: {
        admissionId: admission.id,
        fromBedId: admission.bedId,
        fromBedNumber: admission.bed.bedNumber,
        fromWard: admission.bed.ward,
        toBedId: toBed.id,
        toBedNumber: toBed.bedNumber,
        toWard: toBed.ward,
        reason: input.reason?.trim() || null,
        transferredById: actor.id,
      },
    });

    await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });
    await tx.bed.update({ where: { id: toBed.id }, data: { status: "OCCUPIED" } });

    const updated = await tx.admission.update({
      where: { id },
      data: { bedId: toBed.id, ward: toBed.ward },
      include: { bed: true },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "ADMISSION_TRANSFERRED",
      entity: "Admission",
      entityId: id,
      before: { bedId: admission.bedId, ward: admission.ward, bedNumber: admission.bed.bedNumber },
      after: { bedId: toBed.id, ward: toBed.ward, bedNumber: toBed.bedNumber, reason: input.reason ?? null },
    });

    return { admission: updated, transfer };
  });
}

export async function addProgressNote(
  admissionId: string,
  rawInput: ProgressNoteInput,
  actor: User,
) {
  assertWork(actor);
  const input = progressNoteSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const admission = await tx.admission.findUnique({ where: { id: admissionId } });
    if (!admission) throw new ApiError(404, "Admission not found");
    if (admission.status !== "ADMITTED") {
      throw new ApiError(409, "Progress notes can only be added while the patient is admitted");
    }

    const noteDate = parseDate(input.noteDate, "Note date") ?? new Date();

    const note = await tx.progressNote.create({
      data: {
        admissionId,
        authorId: actor.id,
        noteDate,
        note: input.note,
        treatment: input.treatment?.trim() || null,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "IP_PROGRESS_NOTE_ADDED",
      entity: "Admission",
      entityId: admissionId,
      before: null,
      after: { progressNoteId: note.id, noteDate: note.noteDate },
    });

    return note;
  });
}

/**
 * Discharges the patient, frees the bed and (optionally) raises the discharge
 * bill as a normal IP invoice. Room charges are computed on the server from
 * the bed tariff and length of stay; the client only supplies extras.
 */
export async function dischargeAdmission(
  id: string,
  rawInput: DischargeInput,
  actor: User,
) {
  assertDischarge(actor);
  const input = dischargeSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      const admission = await tx.admission.findUnique({
        where: { id },
        include: { bed: true, patient: { select: { id: true, uhid: true, name: true } } },
      });
      if (!admission) throw new ApiError(404, "Admission not found");
      if (admission.status === "DISCHARGED") {
        throw new ApiError(409, `Admission ${admission.admissionNo} is already discharged`);
      }

      const dischargeDate = parseDate(input.dischargeDate, "Discharge date") ?? new Date();
      if (dischargeDate.getTime() < admission.admissionDate.getTime()) {
        throw new ApiError(400, "Discharge date cannot be before the admission date");
      }

      const days = computeStayDays(admission.admissionDate, dischargeDate);
      const roomChargePaise = admission.bed.dailyRatePaise * days;

      const items: { category: string; description: string; amount: number }[] = [];
      if (roomChargePaise > 0) {
        const room = admission.bed.roomNo ? `Room ${admission.bed.roomNo} · ` : "";
        items.push({
          category: "ROOM_CHARGES",
          description: `${room}${admission.ward} (${admission.bed.bedNumber}) — ${days} day(s) @ ${formatINR(admission.bed.dailyRatePaise)}/day`,
          amount: roomChargePaise,
        });
      }
      for (const extra of input.billItems) {
        items.push({
          category: extra.category,
          description: extra.description,
          amount: Math.round(extra.amountRupees * 100),
        });
      }

      let invoiceId: string | null = admission.invoiceId;
      let invoice: { id: string; invoiceNo: string; totalAmount: number; status: string } | null = null;

      if (input.createInvoice && items.length > 0 && !admission.invoiceId) {
        const year = new Date().getFullYear();
        const seqNo = await nextSequence(tx, "INVOICE", year);
        const invoiceNo = `INV-${year}-${String(seqNo).padStart(5, "0")}`;
        const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

        const created = await tx.invoice.create({
          data: {
            invoiceNo,
            patientId: admission.patientId,
            department: "IP",
            billType: "GENERAL",
            status: "UNPAID",
            totalAmount,
            paidAmount: 0,
            createdBy: actor.id,
            items: {
              create: items.map((item) => ({
                category: item.category as ItemCategory,
                description: item.description,
                amount: item.amount,
              })),
            },
          },
          include: { items: true },
        });

        invoiceId = created.id;
        invoice = {
          id: created.id,
          invoiceNo: created.invoiceNo,
          totalAmount: created.totalAmount,
          status: created.status,
        };

        await writeAuditLog(tx, {
          userId: actor.id,
          action: "INVOICE_CREATED",
          entity: "Invoice",
          entityId: created.id,
          after: {
            invoiceNo,
            patientUhid: admission.patient.uhid,
            department: "IP",
            totalAmount,
            itemCount: items.length,
            source: "IP_DISCHARGE",
            admissionNo: admission.admissionNo,
          },
        });
      }

      const updated = await tx.admission.update({
        where: { id },
        data: {
          status: "DISCHARGED",
          dischargeDate,
          dischargeSummary: input.dischargeSummary,
          dischargeType: input.dischargeType,
          finalDiagnosis: input.finalDiagnosis?.trim() || null,
          conditionAtDischarge: input.conditionAtDischarge?.trim() || null,
          dischargedById: actor.id,
          ...(invoiceId ? { invoiceId } : {}),
        },
      });

      await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "ADMISSION_DISCHARGED",
        entity: "Admission",
        entityId: id,
        before: { status: admission.status, bedId: admission.bedId },
        after: {
          status: updated.status,
          dischargeType: updated.dischargeType,
          dischargeDate: updated.dischargeDate,
          days,
          roomChargePaise,
          invoiceId,
        },
      });

      return { admission: updated, invoice, days, roomChargePaise };
    },
    { timeout: 15_000 },
  );
}

// ---------------------------------------------------------------------------
// Beds, wards & occupancy
// ---------------------------------------------------------------------------

export async function listBeds() {
  return prisma.bed.findMany({
    orderBy: [{ ward: "asc" }, { bedNumber: "asc" }],
    include: {
      admissions: {
        where: { status: "ADMITTED" },
        take: 1,
        select: {
          id: true,
          admissionNo: true,
          admissionDate: true,
          patient: { select: { id: true, name: true, uhid: true } },
        },
      },
    },
  });
}

export async function listAvailableBeds() {
  return prisma.bed.findMany({
    where: { status: "AVAILABLE" },
    orderBy: [{ ward: "asc" }, { bedNumber: "asc" }],
    select: {
      id: true,
      bedNumber: true,
      ward: true,
      roomNo: true,
      floor: true,
      dailyRatePaise: true,
    },
  });
}

export async function listWards(): Promise<string[]> {
  const rows = await prisma.bed.findMany({
    distinct: ["ward"],
    select: { ward: true },
    orderBy: { ward: "asc" },
  });
  return rows.map((row) => row.ward);
}

export async function getIpOverview() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [admitted, discharged, admittedToday, beds] = await Promise.all([
    prisma.admission.count({ where: { status: "ADMITTED" } }),
    prisma.admission.count({ where: { status: "DISCHARGED" } }),
    prisma.admission.count({ where: { admissionDate: { gte: startOfDay } } }),
    prisma.bed.groupBy({ by: ["status"], _count: true }),
  ]);

  const bedCounts = beds.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count;
    return acc;
  }, {});

  return {
    admitted,
    discharged,
    admittedToday,
    bedsTotal: beds.reduce((sum, row) => sum + row._count, 0),
    bedsAvailable: bedCounts.AVAILABLE ?? 0,
    bedsOccupied: bedCounts.OCCUPIED ?? 0,
    bedsMaintenance: bedCounts.MAINTENANCE ?? 0,
  };
}

export async function createBed(rawInput: BedInput, actor: User) {
  assertBedManage(actor);
  const input = bedSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const bed = await tx.bed.create({
        data: {
          bedNumber: input.bedNumber.trim().toUpperCase(),
          ward: input.ward.trim(),
          roomNo: input.roomNo?.trim() || null,
          floor: input.floor?.trim() || null,
          dailyRatePaise: Math.round(input.dailyRateRupees * 100),
          status: input.status ?? "AVAILABLE",
        },
      });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "BED_CREATED",
        entity: "Bed",
        entityId: bed.id,
        before: null,
        after: { bedNumber: bed.bedNumber, ward: bed.ward, roomNo: bed.roomNo, dailyRatePaise: bed.dailyRatePaise },
      });

      return bed;
    });
  } catch (error) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, `Bed ${input.bedNumber.toUpperCase()} already exists`);
    }
    throw error;
  }
}

export async function updateBed(id: string, rawInput: UpdateBedInput, actor: User) {
  assertBedManage(actor);
  const input = updateBedSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.bed.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Bed not found");

    if (input.status && input.status !== "OCCUPIED") {
      const active = await tx.admission.count({ where: { bedId: id, status: "ADMITTED" } });
      if (active > 0) {
        throw new ApiError(409, "This bed is occupied. Transfer or discharge the patient first.");
      }
    }

    const updated = await tx.bed.update({
      where: { id },
      data: {
        ...(input.bedNumber !== undefined ? { bedNumber: input.bedNumber.trim().toUpperCase() } : {}),
        ...(input.ward !== undefined ? { ward: input.ward.trim() } : {}),
        ...(input.roomNo !== undefined ? { roomNo: input.roomNo?.trim() || null } : {}),
        ...(input.floor !== undefined ? { floor: input.floor?.trim() || null } : {}),
        ...(input.dailyRateRupees !== undefined
          ? { dailyRatePaise: Math.round(input.dailyRateRupees * 100) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "BED_UPDATED",
      entity: "Bed",
      entityId: id,
      before: { bedNumber: before.bedNumber, ward: before.ward, status: before.status, dailyRatePaise: before.dailyRatePaise },
      after: { bedNumber: updated.bedNumber, ward: updated.ward, status: updated.status, dailyRatePaise: updated.dailyRatePaise },
    });

    return updated;
  });
}

export async function deleteBed(id: string, actor: User) {
  assertBedManage(actor);

  return prisma.$transaction(async (tx) => {
    const before = await tx.bed.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Bed not found");

    const used = await tx.admission.count({ where: { bedId: id } });
    if (used > 0) {
      throw new ApiError(409, "This bed has admission history. Mark it under maintenance instead of deleting it.");
    }

    await tx.bed.delete({ where: { id } });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "BED_DELETED",
      entity: "Bed",
      entityId: id,
      before: { bedNumber: before.bedNumber, ward: before.ward },
      after: null,
    });

    return { success: true, deletedId: id };
  });
}
