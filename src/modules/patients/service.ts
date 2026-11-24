import "server-only";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { REGISTRATION_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import { triggerRegistrationSmsAsync } from "@/modules/communication/sms-service";
import {
  ageFromDob,
  createPatientSchema,
  updatePatientSchema,
  type CreatePatientInput,
  type UpdatePatientInput,
} from "./schemas";

/**
 * Registration & edits belong to Reception + Admin (REGISTRATION_ROLES).
 * The API routes guard too; the service re-checks so every caller and test
 * gets the same 403 (same pattern as the service catalog).
 */
function assertCanRegister(actor: User) {
  const result = authorize(
    { role: actor.role, active: actor.active },
    REGISTRATION_ROLES,
  );
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function snapshot(patient: Patient) {
  return {
    uhid: patient.uhid,
    name: patient.name,
    phone: patient.phone,
    age: patient.age,
    gender: patient.gender,
    dob: patient.dob,
    bloodGroup: patient.bloodGroup,
    address: patient.address,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
  };
}

/** AH-YYYY-NNNNNN from the shared SequenceCounter (kind "UHID", width 6). */
async function nextUhid(tx: Parameters<typeof nextSequence>[0]): Promise<string> {
  const year = new Date().getFullYear();
  const value = await nextSequence(tx, "UHID", year);
  return `AH-${year}-${String(value).padStart(6, "0")}`;
}

function dobDate(dob: string | undefined | null): Date | null {
  if (!dob) return null;
  // UTC midnight — matches the `@db.Date` column semantics exactly.
  return new Date(`${dob}T00:00:00Z`);
}

/**
 * POST /api/patients — registers one patient with an auto-generated UHID.
 * Age is derived from the date of birth when both are supplied.
 * Audit-logged as PATIENT_CREATED in the same transaction.
 */
export async function createPatient(
  rawInput: CreatePatientInput,
  actor: User,
): Promise<Patient> {
  assertCanRegister(actor);
  const input = createPatientSchema.parse(rawInput);

  const dob = dobDate(input.dob);
  let age: number;
  if (dob) {
    age = ageFromDob(dob);
  } else if (input.age !== undefined) {
    age = input.age;
  } else {
    // Schema already enforces this; kept as an explicit server-side guard.
    throw new ApiError(400, "Enter the patient's age or date of birth");
  }

  const result = await prisma.$transaction(async (tx) => {
    const uhid = await nextUhid(tx);
    const patient = await tx.patient.create({
      data: {
        uhid,
        name: input.name,
        phone: input.phone,
        age,
        gender: input.gender,
        dob,
        bloodGroup: input.bloodGroup ?? null,
        address: input.address || null,
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "PATIENT_CREATED",
      entity: "Patient",
      entityId: patient.id,
      before: null,
      after: snapshot(patient),
    });

    return patient;
  });

  // Asynchronously trigger Patient Registration SMS (non-blocking)
  triggerRegistrationSmsAsync({
    id: result.id,
    name: result.name,
    uhid: result.uhid,
    phone: result.phone,
  }, actor.id);

  return result;
}

/**
 * PATCH /api/patients/:id — partial demographic update.
 * When dob is supplied the age is recomputed from it; clearing dob keeps the
 * stored age. Audit-logged as PATIENT_UPDATED with before/after snapshots.
 */
export async function updatePatient(
  id: string,
  rawInput: UpdatePatientInput,
  actor: User,
): Promise<Patient> {
  assertCanRegister(actor);
  const input = updatePatientSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const before = await tx.patient.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Patient not found");

    // undefined = leave unchanged ("" clears the date of birth).
    const nextDob =
      input.dob === undefined
        ? before.dob
        : input.dob === ""
          ? null
          : dobDate(input.dob);

    const age = nextDob
      ? ageFromDob(nextDob)
      : input.age !== undefined
        ? input.age
        : before.age;

    const after = await tx.patient.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.bloodGroup !== undefined
          ? { bloodGroup: input.bloodGroup }
          : {}),
        ...(input.address !== undefined
          ? { address: input.address || null }
          : {}),
        ...(input.emergencyContactName !== undefined
          ? { emergencyContactName: input.emergencyContactName || null }
          : {}),
        ...(input.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: input.emergencyContactPhone || null }
          : {}),
        dob: nextDob,
        age,
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "PATIENT_UPDATED",
      entity: "Patient",
      entityId: after.id,
      before: snapshot(before),
      after: snapshot(after),
    });

    return after;
  });
}
