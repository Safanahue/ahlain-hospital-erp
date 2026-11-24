import "server-only";
import type { Prisma } from "@prisma/client";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { APPOINTMENT_ROLES, assertCanBook } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import {
  appointmentListQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
} from "./schemas";
import { appointmentSlotsQuerySchema } from "./schemas";

export async function getAppointmentSlots(
  query: unknown,
): Promise<{ datetime: Date; total: number; booked: number; free: number }[]> {
  const parsed = appointmentSlotsQuerySchema.parse(query);
  const startDate = parsed.date
    ? new Date(`${parsed.date}T00:00:00Z`)
    : new Date();
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60_000);

  const rows = await prisma.appointment.findMany({
    where: {
      doctorId: parsed.doctorId,
      slot: { gte: startDate, lt: endDate },
    },
    select: { slot: true },
  });

  const slots: {
    datetime: Date;
    total: number;
    booked: number;
    free: number;
  }[] = [];

  for (let ts = startDate.getTime(); ts < endDate.getTime(); ts += 60 * 60_000 / 2) {
    const datetime = new Date(ts);
    slots.push({
      datetime,
      total: 2,
      booked: 0,
      free: 0,
    });
  }

  for (const row of rows) {
    const hour = row.slot.getHours() * 3600 + row.slot.getMinutes() * 60;
    const index = Math.floor(hour / (3600 / 2));
    if (index >= 0 && index < slots.length) {
      slots[index].booked += 1;
      slots[index].free = 2 - slots[index].booked;
    }
  }

  return slots;
}

function assertCanBookRole(actor: User) {
  const result = assertCanBook({ role: actor.role, active: actor.active });
  if (!result.ok) throw new ApiError(result.status, result.message);
}

export async function createAppointment(
  rawInput: CreateAppointmentInput,
  actor: User,
): Promise<{ id: string; seqNo: number; slot: Date; status: string; patientId: string; doctorId: string }> {
  assertCanBookRole(actor);
  const input = createAppointmentSchema.parse(rawInput);

  const slotDate = new Date(input.slot.includes("T") ? input.slot : `${input.slot}T10:00:00Z`);

  return prisma.$transaction(async (tx) => {
    // Check doctor conflict
    const existing = await tx.appointment.findFirst({
      where: {
        doctorId: input.doctorId,
        slot: slotDate,
      },
    });
    if (existing) {
      throw new ApiError(409, "Doctor is already booked for this time slot");
    }

    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "APPOINTMENT", year);

    const appointment = await tx.appointment.create({
      data: {
        seqNo,
        slot: slotDate,
        patientId: input.patientId,
        doctorId: input.doctorId,
        status: "SCHEDULED",
        notes: input.notes || null,
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "APPOINTMENT_CREATED",
      entity: "Appointment",
      entityId: appointment.id,
      before: null,
      after: {
        id: appointment.id,
        seqNo: appointment.seqNo,
        slot: appointment.slot,
        status: appointment.status,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
      },
    });

    return { id: appointment.id, seqNo: appointment.seqNo, slot: appointment.slot, status: appointment.status, patientId: appointment.patientId, doctorId: appointment.doctorId };
  });
}

export async function listAppointments(
  query: unknown,
): Promise<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const parsed = appointmentListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.flatten().fieldErrors);
  }
  const { page, pageSize, q, patientId, doctorId, status, from, to } = parsed.data;

  const where: Prisma.AppointmentWhereInput = { slot: {} }
  if (patientId) where.patientId = patientId;
  if (doctorId) where.doctorId = doctorId;
  // @ts-ignore
  if (status && status !== "ALL") where.status = status;
  // @ts-ignore
if (from) where.slot = { ...where.slot, gte: new Date(`${from}T00:00:00Z`) };
  // @ts-ignore
if (to) where.slot = { ...where.slot, lte: new Date(`${to}T23:59:59Z`) };
  if (q) {
    where.OR = [
      { patient: { name: { contains: q, mode: "insensitive" } } },
      { doctor: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      orderBy: [{ slot: "asc" }, { seqNo: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, uhid: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
    }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    seqNo: row.seqNo,
    slot: row.slot,
    status: row.status,
    patientId: row.patientId,
    patientName: row.patient.name,
    patientPhone: row.patient.phone,
    patientUhid: row.patient.uhid,
    doctorId: row.doctor.id,
    doctorName: row.doctor.name,
  }));

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAppointment(id: string): Promise<{ id: string; seqNo: number; slot: Date; status: string; patientId: string; doctorId: string } | null> {
  return prisma.appointment.findUnique({ where: { id } });
}

export async function updateAppointment(
  id: string,
  rawInput: UpdateAppointmentInput,
  actor: User,
): Promise<{ id: string; seqNo: number; slot: Date; status: string; patientId: string; doctorId: string }> {
  const result = authorize({ role: actor.role, active: actor.active }, APPOINTMENT_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);

  const input = updateAppointmentSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Appointment not found");

    // Prevent invalid transitions
    if (before.status === "DONE" || before.status === "NO_SHOW") {
      throw new ApiError(400, `Cannot change status of an appointment that is already ${before.status}`);
    }

    const nextStatus: string =
      input.status === "CHECKED_IN"
        ? "CHECKED_IN"
        : input.status === "DONE"
          ? "DONE"
          : "NO_SHOW";

    const after = await tx.appointment.update({
      where: { id },
      data: { status: nextStatus, ...(input.notes !== undefined ? { notes: input.notes || null } : {}) },
    });

    const action: string =
      input.status === "CHECKED_IN"
        ? "APPOINTMENT_CHECKED_IN"
        : input.status === "DONE"
          ? "APPOINTMENT_COMPLETED"
          : "APPOINTMENT_NO_SHOW";

    await writeAuditLog(tx, {
      userId: actor.id,
      action,
      entity: "Appointment",
      entityId: after.id,
      before: {
        id: before.id,
        seqNo: before.seqNo,
        slot: before.slot,
        status: before.status,
        patientId: before.patientId,
        doctorId: before.doctorId,
      },
      after: {
        id: after.id,
        seqNo: after.seqNo,
        slot: after.slot,
        status: after.status,
        patientId: after.patientId,
        doctorId: after.doctorId,
      },
    });

    return { id: after.id, seqNo: after.seqNo, slot: after.slot, status: after.status, patientId: after.patientId, doctorId: after.doctorId };
  });
}export function getAppointmentListQuerySchema() {
  return appointmentListQuerySchema;
}
export function getCreateAppointmentSchema() {
  return createAppointmentSchema;
}
export function getUpdateAppointmentSchema() {
  return updateAppointmentSchema;
}