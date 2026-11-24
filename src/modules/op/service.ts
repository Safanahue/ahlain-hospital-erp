import "server-only";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { APPOINTMENT_ROLES, OP_VISIT_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import {
  createOpVisitSchema,
  updateOpVisitSchema,
  type CreateOpVisitInput,
  type UpdateOpVisitInput,
} from "./schemas";
function assertCanRegister(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, OP_VISIT_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function assertCanAdvance(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, OP_VISIT_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function snapshot(visit: { id: string; opNo: string; status: string; patientId: string; doctorId: string }) {
  return { id: visit.id, opNo: visit.opNo, status: visit.status, patientId: visit.patientId, doctorId: visit.doctorId };
}

function opNo(year: number, value: number): string {
  return `AH-OP-${year}-${String(value).padStart(4, "0")}`;
}

/**
 * POST /api/op/visits — register one OP visit, assigning the alphabetical
 * queue number in the same transaction as the row + audit log.
 */
export async function createOpVisit(
  rawInput: CreateOpVisitInput,
  actor: User,
): Promise<{ visit: { id: string; opNo: string; status: string; patientId: string; doctorId: string } }> {
  assertCanRegister(actor);
  const input = createOpVisitSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "OPV", year);
    const visit = await prisma.oPVisit.create({
      data: {
        opNo: opNo(year, seqNo),
        patientId: input.patientId,
        doctorId: input.doctorId,
        nurseId: input.nurseId ?? null,
        complaint: input.complaint || null,
        provisionalDiagnosis: input.provisionalDiagnosis || null,
        treatmentPlan: input.treatmentPlan || null,
        status: "CHECK_IN",
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "OP_VISIT_CREATED",
      entity: "OPVisit",
      entityId: visit.id,
      before: null,
      after: snapshot(visit),
    });

    return { visit };
  });
}

export async function listOpVisits(today?: Date): Promise<
  {
    id: string;
    opNo: string;
    status: string;
    patientId: string;
    doctorId: string;
    nurseId: string | null;
    complaint: string | null;
    provisionalDiagnosis: string | null;
    treatmentPlan: string | null;
    createdAt: Date;
    patient: { id: string; uhid: string; name: string; phone: string; age: number; gender: string };
    doctor: { id: string; name: string };
  }[]
> {
  const where: { createdAt?: { gte: Date; lt: Date } } = {};
  if (today) {
    const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60_000);
    where.createdAt = { gte: startOfDay, lt: endOfDay };
  }

  return prisma.oPVisit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true, age: true, gender: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
}

export async function getOpVisit(
  id: string,
) {
  return prisma.oPVisit.findUnique({
    where: { id },
    include: {
      patient: true,
      doctor: true,
      nurse: true,
    },
  });
}

/**
 * PATCH /api/op/visits/:id — progress the clinical workflow.
 * Audit action reflects what actually changed.
 */
export async function updateOpVisit(
  id: string,
  rawInput: UpdateOpVisitInput,
  actor: User,
): Promise<{ visit: { id: string; opNo: string; status: string; patientId: string; doctorId: string } }> {
  assertCanAdvance(actor);
  const input = updateOpVisitSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.oPVisit.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "OP visit not found");

    // Prevent invalid transitions: COMPLETED and CANCELLED are terminal states
    if (before.status === "COMPLETED" || before.status === "CANCELLED") {
      throw new ApiError(400, `Cannot change status of a visit that is already ${before.status}`);
    }

    const nextStatus: string =
      input.status === "WAITING_ROOM"
        ? "WAITING_ROOM"
        : input.status === "COMPLETED" ? "COMPLETED" : "CANCELLED";

    const after = await tx.oPVisit.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(input.complaint !== undefined ? { complaint: input.complaint || null } : {}),
        ...(input.provisionalDiagnosis !== undefined ? { provisionalDiagnosis: input.provisionalDiagnosis || null } : {}),
        ...(input.treatmentPlan !== undefined ? { treatmentPlan: input.treatmentPlan || null } : {}),
      },
    });

    const action: string =
      input.status === "WAITING_ROOM"
        ? "OP_VISIT_MOVED_TO_WAITING_ROOM"
        : input.status === "COMPLETED"
          ? "OP_VISIT_COMPLETED"
          : "OP_VISIT_CANCELLED";

    await writeAuditLog(tx, {
      userId: actor.id,
      action,
      entity: "OPVisit",
      entityId: after.id,
      before: snapshot(before),
      after: snapshot(after),
    });

    return { visit: { id: after.id, opNo: after.opNo, status: after.status, patientId: after.patientId, doctorId: after.doctorId } };
  });
}
