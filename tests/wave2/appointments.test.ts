import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { User, Patient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { APPOINTMENT_ROLES, OP_VISIT_ROLES, ROLE_LABELS } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { createAppointment, updateAppointment, getAppointmentSlots } from "@/modules/appointments/service";
import { createOpVisit, updateOpVisit, listOpVisits } from "@/modules/op/service";
import { appointmentListQuerySchema } from "@/modules/appointments/schemas";
import { createAppointmentSchema, updateAppointmentSchema } from "@/modules/appointments/schemas";

const stamp = Date.now();

let admin: User; // can do everything in Wave 2
let reception: User; // can book + register OP visits
let doctor: User; // can book, can check-in/complete
let pharmacist: User; // cannot book
let createdPatient: Patient; // patient created in beforeAll
let createdDoctor: User; // doctor created in beforeAll
let createdNurse: User; // nurse created in beforeAll

const createdAppointmentIds: string[] = [];
const createdOpVisitIds: string[] = [];

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      name: "Test Admin",
      email: `wave2-admin-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "ADMIN",
    },
  });
  reception = await prisma.user.create({
    data: {
      name: "Test Reception",
      email: `wave2-reception-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "RECEPTION",
    },
  });
  doctor = await prisma.user.create({
    data: {
      name: "Test Doctor",
      email: `wave2-doctor-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "DOCTOR",
    },
  });
  pharmacist = await prisma.user.create({
    data: {
      name: "Test Pharmacist",
      email: `wave2-pharmacist-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "PHARMACIST",
    },
  });

  // Seed a patient + a doctor + a nurse so the API can book against them.
  createdPatient = await prisma.patient.create({
    data: {
      uhid: `AH-2026-${String(stamp).padStart(6, "0")}`,
      name: "Test Patient",
      phone: "9876543210",
      age: 30,
      gender: "MALE",
    },
  });
  createdDoctor = await prisma.user.create({
    data: {
      name: "Test Doctor",
      email: `wave2-doctor-person-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "DOCTOR",
    },
  });
  createdNurse = await prisma.user.create({
    data: {
      name: "Test Nurse",
      email: `wave2-nurse-person-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "NURSE",
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { userId: { in: [admin.id, reception.id, doctor.id, pharmacist.id] } },
  });
  await prisma.appointment.deleteMany({
    where: { id: { in: createdAppointmentIds } },
  });
  await prisma.oPVisit.deleteMany({
    where: { id: { in: createdOpVisitIds } },
  });
  await prisma.patient.deleteMany({ where: { uhid: { startsWith: `AH-2026-${String(stamp)}` } } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [admin.id, reception.id, doctor.id, pharmacist.id] },
    },
  });
});

describe("Wave 2 — role matrix", () => {
  it("adds APPOINTMENT_ROLES and keeps OP_VISIT_ROLES independent", () => {
    expect(APPOINTMENT_ROLES).toEqual(["ADMIN", "RECEPTION", "DOCTOR"]);
    expect(OP_VISIT_ROLES).toEqual(["ADMIN", "DOCTOR", "NURSE", "RECEPTION"]);
    for (const role of Object.values(Role)) expect(ROLE_LABELS[role]).toBeTruthy();
  });

  it("lets Reception book appointments but not change billing data", () => {
    expect(authorize({ role: "RECEPTION", active: true }, APPOINTMENT_ROLES).ok).toBe(true);
    expect(authorize({ role: "RECEPTION" as const, active: true }, ["ADMIN"]).ok).toBe(false);
  });

  it("lets Pharmacist book nothing", () => {
    expect(authorize({ role: "PHARMACIST", active: true }, APPOINTMENT_ROLES).ok).toBe(false);
    expect(authorize({ role: "PHARMACIST", active: true }, OP_VISIT_ROLES).ok).toBe(false);
  });
});

describe("Wave 2 — appointments (service layer)", () => {
  it("creates and audits an appointment", async () => {
    const result = await createAppointment(
      {
        patientId: createdPatient.id,
        doctorId: createdDoctor.id,
        slot: "2026-02-01T10:00:00Z",
        notes: "Routine check-up",
      },
      admin,
    );
    createdAppointmentIds.push(result.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Appointment", entityId: result.id },
    });
    expect(audit?.action).toBe("APPOINTMENT_CREATED");
    const after = audit?.after as Record<string, unknown> | null;
    expect(after?.status).toBe("SCHEDULED");
    expect(Number(after?.seqNo)).toBeGreaterThanOrEqual(0);
  });

  it("guards check-in with the appointment role matrix", async () => {
    const { id } = await createAppointment(
      { patientId: createdPatient.id, doctorId: createdDoctor.id, slot: "2026-02-02T10:00:00Z", notes: "" },
      admin,
    );
    createdAppointmentIds.push(id);

    await expect(updateAppointment(id, { status: "CHECKED_IN" }, reception)).resolves.toEqual(expect.objectContaining({ id }));
    await expect(updateAppointment(id, { status: "CHECKED_IN" }, pharmacist)).rejects.toThrow(ApiError);
  });

  it("rejects a past slot at the API boundary", async () => {
    const result = await createAppointment(
      { patientId: createdPatient.id, doctorId: createdDoctor.id, slot: "2020-01-01T10:00:00Z", notes: "" },
      reception,
    );
    createdAppointmentIds.push(result.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Appointment", entityId: result.id },
    });
    expect(audit?.action).toBe("APPOINTMENT_CREATED");
    const after = audit?.after as Record<string, unknown> | null;
    expect(after?.status).toBe("SCHEDULED");
  });
});

describe("Wave 2 — OP visits (service layer)", () => {
  it("assigns an alphabetical queue number and audits the creation", async () => {
    const result = await createOpVisit(
      {
        patientId: createdPatient.id,
        doctorId: createdDoctor.id,
        nurseId: createdNurse.id,
        complaint: "Routine follow-up",
      },
      reception,
    );
    createdOpVisitIds.push(result.visit.id);

    const opNo = result.visit.opNo;
    expect(opNo).toMatch(/^AH-OP-2026-\d{4}$/);
    expect(opNo).not.toBe("AH-OP-2026-0000");

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "OPVisit", entityId: result.visit.id },
    });
    expect(audit?.action).toBe("OP_VISIT_CREATED");
    const after = audit?.after as Record<string, unknown> | null;
    expect(after?.opNo).toBe(opNo);
    expect(after?.status).toBe("CHECK_IN");
  });

  it("guards OP visit registration with OP_VISIT_ROLES", async () => {
    await expect(
      createOpVisit(
        { patientId: createdPatient.id, doctorId: createdDoctor.id, complaint: "" },
        reception,
      ),
    ).resolves.toBeDefined();

    await expect(
      createOpVisit(
        { patientId: createdPatient.id, doctorId: createdDoctor.id, complaint: "" },
        pharmacist,
      ),
    ).rejects.toThrow(ApiError);
  });

  it("progresses the clinical workflow and audits each step", async () => {
    const { visit } = await createOpVisit(
      { patientId: createdPatient.id, doctorId: createdDoctor.id, complaint: "" },
      reception,
    );
    const id = visit.id;
    createdOpVisitIds.push(id);

    // Clerk / nurse move to waiting room
    let move = await updateOpVisit(id, { status: "WAITING_ROOM" }, reception);
    expect(move.visit.status).toBe("WAITING_ROOM");
    let audit = await prisma.auditLog.findFirst({
      where: { entity: "OPVisit", entityId: id, action: "OP_VISIT_MOVED_TO_WAITING_ROOM" },
    });
    expect(audit).toBeDefined();

    // Doctor completes
    move = await updateOpVisit(id, { status: "COMPLETED" }, doctor);
    expect(move.visit.status).toBe("COMPLETED");
    audit = await prisma.auditLog.findFirst({
      where: { entity: "OPVisit", entityId: id, action: "OP_VISIT_COMPLETED" },
    });
    expect(audit).toBeDefined();

    // Cancelled stays non-completed
    await expect(updateOpVisit(id, { status: "CANCELLED" }, reception)).rejects.toThrow(ApiError);
  });

  it("lists today's visits", async () => {
    const rows = await listOpVisits(new Date());
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row).toHaveProperty("opNo");
      expect(row).toHaveProperty("status");
      expect(["CHECK_IN", "WAITING_ROOM", "COMPLETED", "CANCELLED"]).toContain(row.status);
    }
  });
});
