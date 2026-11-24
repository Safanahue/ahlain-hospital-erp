import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { DENTAL_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import {
  createDentalEncounterSchema,
  updateDentalEncounterSchema,
  type CreateDentalEncounterInput,
  type UpdateDentalEncounterInput,
} from "./schemas";

function assertCanAccessDental(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, DENTAL_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function dentalNo(year: number, value: number): string {
  return `AH-DENT-${year}-${String(value).padStart(4, "0")}`;
}

export async function createDentalEncounter(
  rawInput: CreateDentalEncounterInput,
  actor: User,
) {
  assertCanAccessDental(actor);
  const input = createDentalEncounterSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "DENTAL", year);

    const encounter = await tx.dentalEncounter.create({
      data: {
        dentalNo: dentalNo(year, seqNo),
        patientId: input.patientId,
        dentistId: input.dentistId,
        procedureName: input.procedureName,
        toothNumber: input.toothNumber || null,
        chiefComplaint: input.chiefComplaint || null,
        clinicalNotes: input.clinicalNotes || null,
        costPaise: Math.round(input.costRupees * 100),
        status: "IN_PROGRESS",
      },
      include: {
        patient: { select: { id: true, name: true, uhid: true, phone: true } },
        dentist: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "DENTAL_ENCOUNTER_CREATED",
      entity: "DentalEncounter",
      entityId: encounter.id,
      before: null,
      after: {
        id: encounter.id,
        dentalNo: encounter.dentalNo,
        patientId: encounter.patientId,
        procedureName: encounter.procedureName,
        status: encounter.status,
      },
    });

    return encounter;
  });
}

export async function listDentalEncounters() {
  return prisma.dentalEncounter.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, uhid: true, phone: true, age: true, gender: true } },
      dentist: { select: { id: true, name: true } },
    },
  });
}

export async function getDentalEncounter(id: string) {
  return prisma.dentalEncounter.findUnique({
    where: { id },
    include: {
      patient: true,
      dentist: true,
    },
  });
}

export async function updateDentalEncounter(
  id: string,
  rawInput: UpdateDentalEncounterInput,
  actor: User,
) {
  assertCanAccessDental(actor);
  const input = updateDentalEncounterSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.dentalEncounter.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Dental encounter not found");

    if (before.status === "COMPLETED" || before.status === "CANCELLED") {
      throw new ApiError(400, `Cannot modify an encounter that is already ${before.status}`);
    }

    const updated = await tx.dentalEncounter.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.clinicalNotes !== undefined ? { clinicalNotes: input.clinicalNotes || null } : {}),
        ...(input.toothNumber !== undefined ? { toothNumber: input.toothNumber || null } : {}),
        ...(input.costRupees !== undefined ? { costPaise: Math.round(input.costRupees * 100) } : {}),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: `DENTAL_ENCOUNTER_${input.status}`,
      entity: "DentalEncounter",
      entityId: updated.id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  });
}
