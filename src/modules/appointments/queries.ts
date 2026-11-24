import type { Prisma } from "@prisma/client";
import type { Patient } from "@prisma/client";
import { ApiError } from "@/modules/shared/api";
import { prisma } from "@/lib/prisma";
import {
  appointmentListQuerySchema,
  type AppointmentListQuery,
} from "./schemas";

function isNotAll(status: string): status is Exclude<string, 'ALL'> { return status !== 'ALL'; }
function isNotAllStatus(status: string): status is Exclude<string, 'ALL'> { return status !== 'ALL'; }
export async function listAppointmentsWithDetails(
  query: unknown,
): Promise<
  {
    items: {
      id: string;
      seqNo: number;
      slot: Date;
      status: string;
      patientId: string;
      patientName: string;
      patientPhone: string;
      patientUhid: string;
      doctorId: string;
      doctorName: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }
> {
  const parsed = appointmentListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.flatten().fieldErrors);
  }
  const { page, pageSize, q, patientId, doctorId, status, from, to } = parsed.data;

  const where: Prisma.AppointmentWhereInput = { slot: {} } as Prisma.AppointmentWhereInput
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

  return {
    items: rows.map((row) => ({
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
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type AppointmentWithPatient = {
  id: string;
  seqNo: number;
  slot: Date;
  status: string;
  notes?: string | null;
  patient: Pick<Patient, "id" | "uhid" | "name" | "phone" | "age" | "gender">;
  doctor: Pick<Patient, "id" | "uhid" | "name" | "phone">;
  createdAt: Date;
  updatedAt: Date;
};

/** GET /api/appointments/:id — one appointment with full patient and doctor. */
export async function getAppointmentWithDetails(id: string): Promise<AppointmentWithPatient | null> {
  return prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true, age: true, gender: true } },
      doctor: { select: { id: true, name: true } },
    },
  }) as Promise<AppointmentWithPatient | null>;
}
