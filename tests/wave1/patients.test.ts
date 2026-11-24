import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import {
  PATIENT_VIEW_ROLES,
  REGISTRATION_ROLES,
  ROLE_LABELS,
} from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import {
  ageFromDob,
  createPatientSchema,
  patientListQuerySchema,
  updatePatientSchema,
  type CreatePatientInput,
} from "@/modules/patients/schemas";
import { createPatient, updatePatient } from "@/modules/patients/service";
import { getPatientDetail, listPatients } from "@/modules/patients/queries";

const stamp = Date.now();

let reception: User; // can register patients
let doctor: User; // can view, cannot register
let nurse: User; // can view, cannot register

const createdPatientIds: string[] = [];

beforeAll(async () => {
  reception = await prisma.user.create({
    data: {
      name: "Test Reception",
      email: `wave1-reception-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "RECEPTION",
    },
  });
  doctor = await prisma.user.create({
    data: {
      name: "Test Doctor",
      email: `wave1-doctor-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "DOCTOR",
    },
  });
  nurse = await prisma.user.create({
    data: {
      name: "Test Nurse",
      email: `wave1-nurse-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "NURSE",
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      userId: { in: [reception.id, doctor.id, nurse.id] },
      entity: "Patient",
    },
  });
  await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [reception.id, doctor.id, nurse.id] } },
  });
  await prisma.$disconnect();
});

const baseInput = (
  overrides: Partial<CreatePatientInput> = {},
): CreatePatientInput => ({
  name: "Wave One Patient",
  phone: "9847000001",
  age: 30,
  gender: "OTHER",
  bloodGroup: null,
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  ...overrides,
});

async function register(overrides: Partial<CreatePatientInput> = {}) {
  const patient = await createPatient(baseInput(overrides), reception);
  createdPatientIds.push(patient.id);
  return patient;
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  messagePattern: RegExp,
) {
  try {
    await promise;
    throw new Error("expected the operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.message).toMatch(messagePattern);
  }
}

describe("patient zod validation", () => {
  it("rejects invalid phone numbers", () => {
    expect(
      createPatientSchema.safeParse(baseInput({ phone: "12345" })).success,
    ).toBe(false);
    expect(
      createPatientSchema.safeParse(baseInput({ phone: "abcdefghijk" }))
        .success,
    ).toBe(false);
  });

  it("normalises +91 and spaced phone input", () => {
    const parsed = createPatientSchema.parse(
      baseInput({ phone: "+91 98470-11236" }),
    );
    expect(parsed.phone).toBe("9847011236");
  });

  it("rejects invalid gender and blood group values", () => {
    expect(
      createPatientSchema.safeParse({
        ...baseInput(),
        gender: "UNKNOWN",
      }).success,
    ).toBe(false);
    expect(
      createPatientSchema.safeParse({ ...baseInput(), bloodGroup: "AB++" })
        .success,
    ).toBe(false);
  });

  it("requires an age unless a date of birth is supplied", () => {
    expect(
      createPatientSchema.safeParse({
        ...baseInput(),
        age: undefined,
        dob: undefined,
      }).success,
    ).toBe(false);
    expect(
      createPatientSchema.safeParse({
        ...baseInput(),
        age: undefined,
        dob: "1996-08-14",
      }).success,
    ).toBe(true);
    // Empty dob string is accepted when the age is present.
    expect(createPatientSchema.safeParse(baseInput({ dob: "" })).success).toBe(
      true,
    );
  });

  it("rejects out-of-range ages and impossible dates", () => {
    expect(createPatientSchema.safeParse(baseInput({ age: 130 })).success).toBe(
      false,
    );
    expect(createPatientSchema.safeParse(baseInput({ age: -1 })).success).toBe(
      false,
    );
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      createPatientSchema.safeParse(baseInput({ dob: tomorrow })).success,
    ).toBe(false);
    expect(
      createPatientSchema.safeParse(baseInput({ dob: "1996/08/14" })).success,
    ).toBe(false);
  });

  it("rejects an empty update payload", () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });

  it("computes whole years from a date of birth", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(ageFromDob(new Date("1990-05-01T00:00:00Z"), now)).toBe(36);
    expect(ageFromDob(new Date("1990-12-01T00:00:00Z"), now)).toBe(35);
    expect(ageFromDob(new Date("1990-10-07T00:00:00Z"), now)).toBe(36);
  });

  it("accepts only valid list filters", () => {
    expect(patientListQuerySchema.safeParse({ gender: "UNKNOWN" }).success).toBe(
      false,
    );
    expect(patientListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(patientListQuerySchema.safeParse({ page: "2", q: "anjali" }).success).toBe(
      true,
    );
  });
});

describe("patient registration", () => {
  it("generates a sequential AH-YYYY-NNNNNN UHID and audit-logs PATIENT_CREATED", async () => {
    const first = await register({ name: `UHID First ${stamp}` });
    const second = await register({ name: `UHID Second ${stamp}` });

    expect(first.uhid).toMatch(/^AH-\d{4}-\d{6}$/);
    expect(second.uhid).not.toBe(first.uhid);
    expect(Number(second.uhid.slice(-6))).toBe(Number(first.uhid.slice(-6)) + 1);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Patient", entityId: first.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe("PATIENT_CREATED");
    expect(audit!.userId).toBe(reception.id);
    expect((audit!.after as { uhid: string }).uhid).toBe(first.uhid);
  });

  it("derives the age from the date of birth when both are supplied", async () => {
    const dob = "1990-05-01";
    const patient = await register({
      name: `DOB Patient ${stamp}`,
      age: 99,
      dob,
    });
    expect(patient.age).toBe(ageFromDob(new Date(`${dob}T00:00:00Z`)));
    expect(patient.age).not.toBe(99);
    expect(patient.dob).not.toBeNull();
  });

  it("stores null for cleared optional fields", async () => {
    const patient = await register({
      name: `Minimal Patient ${stamp}`,
      age: 12,
      bloodGroup: "",
      dob: undefined,
    });
    expect(patient.bloodGroup).toBeNull();
    expect(patient.dob).toBeNull();
    expect(patient.address).toBeNull();
    expect(patient.emergencyContactPhone).toBeNull();
  });

  it("rejects registration from roles outside REGISTRATION_ROLES", async () => {
    expect(authorize(doctor, REGISTRATION_ROLES).ok).toBe(false);
    expect(authorize(nurse, REGISTRATION_ROLES).ok).toBe(false);
    await expectApiError(
      createPatient(baseInput({ name: `Doctor Attempt ${stamp}` }), doctor),
      403,
      /permission/,
    );
    await expectApiError(
      createPatient(baseInput({ name: `Nurse Attempt ${stamp}` }), nurse),
      403,
      /permission/,
    );
  });
});

describe("patient updates", () => {
  it("updates demographics and audit-logs PATIENT_UPDATED with before/after", async () => {
    const patient = await register({ name: `Update Target ${stamp}` });

    const updated = await updatePatient(
      patient.id,
      {
        name: `Updated Target ${stamp}`,
        phone: "9847000002",
        bloodGroup: "A+",
        address: "42 Wave Lane, Kochi 682001",
      },
      reception,
    );

    expect(updated.name).toBe(`Updated Target ${stamp}`);
    expect(updated.phone).toBe("9847000002");
    expect(updated.bloodGroup).toBe("A+");
    expect(updated.address).toBe("42 Wave Lane, Kochi 682001");
    expect(updated.uhid).toBe(patient.uhid); // UHID never changes

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Patient", entityId: patient.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit!.action).toBe("PATIENT_UPDATED");
    expect((audit!.before as { name: string }).name).toBe(patient.name);
    expect((audit!.after as { name: string }).name).toBe(updated.name);
  });

  it("recomputes age when dob is set and keeps it when dob is cleared", async () => {
    const patient = await register({ name: `DOB Update ${stamp}`, age: 30 });

    const withDob = await updatePatient(
      patient.id,
      { dob: "2000-01-15" },
      reception,
    );
    expect(withDob.age).toBe(ageFromDob(new Date("2000-01-15T00:00:00Z")));
    expect(withDob.dob).not.toBeNull();

    const cleared = await updatePatient(patient.id, { dob: "" }, reception);
    expect(cleared.dob).toBeNull();
    expect(cleared.age).toBe(withDob.age); // clearing dob must not lose the age
  });

  it("returns 404 for an unknown patient and 403 for unauthorized roles", async () => {
    const patient = await register({ name: `Guard Target ${stamp}` });

    await expectApiError(
      updatePatient(`missing-${stamp}`, { name: "Ghost" }, reception),
      404,
      /not found/i,
    );
    await expectApiError(
      updatePatient(patient.id, { name: "Doctor Edit" }, doctor),
      403,
      /permission/,
    );
  });
});

describe("patient directory", () => {
  it("searches by name, UHID and phone, and filters by gender", async () => {
    const zebra = await register({
      name: `Zebra Q ${stamp}`,
      phone: "9847099991",
      gender: "FEMALE",
    });
    await register({ name: `Other Patient ${stamp}`, phone: "9847099992" });

    const byName = await listPatients({
      page: 1,
      pageSize: 50,
      q: `Zebra Q ${stamp}`,
      gender: undefined,
    });
    expect(byName.items.map((p) => p.id)).toContain(zebra.id);

    const byUhid = await listPatients({
      page: 1,
      pageSize: 50,
      q: zebra.uhid,
      gender: undefined,
    });
    expect(byUhid.items.map((p) => p.id)).toEqual([zebra.id]);

    const byPhone = await listPatients({
      page: 1,
      pageSize: 50,
      q: "9847099991",
      gender: undefined,
    });
    expect(byPhone.items.map((p) => p.id)).toEqual([zebra.id]);

    const byGender = await listPatients({
      page: 1,
      pageSize: 50,
      q: `Zebra Q ${stamp}`,
      gender: "MALE",
    });
    expect(byGender.items).toHaveLength(0);
  });

  it("builds a 360 detail with an empty billing timeline for a new patient", async () => {
    const patient = await register({ name: `Fresh 360 ${stamp}` });

    const detail = await getPatientDetail(patient.id);
    expect(detail).not.toBeNull();
    expect(detail!.patient.uhid).toBe(patient.uhid);
    expect(detail!.invoices).toHaveLength(0);
    expect(detail!.payments).toHaveLength(0);
    expect(detail!.summary).toEqual({
      invoiceCount: 0,
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
    });

    expect(await getPatientDetail(`missing-${stamp}`)).toBeNull();
  });
});

describe("Wave 1 role guards", () => {
  it("gives every role patient view access", () => {
    for (const label of Object.keys(ROLE_LABELS)) {
      const role = label as keyof typeof ROLE_LABELS;
      expect(authorize({ role, active: true }, PATIENT_VIEW_ROLES).ok).toBe(
        true,
      );
    }
  });

  it("restricts registration to Reception and Admin", () => {
    expect(REGISTRATION_ROLES).toEqual(["ADMIN", "RECEPTION"]);
    expect(
      authorize({ role: "RECEPTION", active: true }, REGISTRATION_ROLES).ok,
    ).toBe(true);
    for (const role of ["DOCTOR", "NURSE", "BILLING_STAFF", "PHARMACIST"] as const) {
      expect(authorize({ role, active: true }, REGISTRATION_ROLES).ok).toBe(
        false,
      );
    }
  });

  it("blocks deactivated patients-viewers with 401", () => {
    const result = authorize(
      { role: "NURSE", active: false },
      PATIENT_VIEW_ROLES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
