import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import {
  addProgressNote,
  admissionNo,
  computeStayDays,
  createAdmission,
  dischargeAdmission,
  listAdmissions,
  transferAdmission,
  updateAdmission,
} from "@/modules/ip/service";

const stamp = Date.now();

let admin: User;
let doctor: User;
let secondDoctor: User;
let reception: User;
let pharmacist: User;
let patientA: Patient;
let patientB: Patient;
let bedA: { id: string };
let bedB: { id: string };

const createdAdmissionIds: string[] = [];
const createdInvoiceIds: string[] = [];

beforeAll(async () => {
  const hash = bcrypt.hashSync("test-password", 4);

  admin = await prisma.user.create({
    data: { name: "IP Admin", email: `wave3-ip-admin-${stamp}@ahlain.test`, passwordHash: hash, role: "ADMIN" },
  });
  doctor = await prisma.user.create({
    data: { name: "IP Doctor", email: `wave3-ip-doctor-${stamp}@ahlain.test`, passwordHash: hash, role: "DOCTOR" },
  });
  secondDoctor = await prisma.user.create({
    data: { name: "IP Second Doctor", email: `wave3-ip-doctor2-${stamp}@ahlain.test`, passwordHash: hash, role: "DOCTOR" },
  });
  reception = await prisma.user.create({
    data: { name: "IP Reception", email: `wave3-ip-reception-${stamp}@ahlain.test`, passwordHash: hash, role: "RECEPTION" },
  });
  pharmacist = await prisma.user.create({
    data: { name: "IP Pharmacist", email: `wave3-ip-pharmacist-${stamp}@ahlain.test`, passwordHash: hash, role: "PHARMACIST" },
  });

  patientA = await prisma.patient.create({
    data: {
      uhid: `AH-IP-T-${stamp}-A`,
      name: "IP Test Patient A",
      phone: "9000000001",
      age: 42,
      gender: "MALE",
    },
  });
  patientB = await prisma.patient.create({
    data: {
      uhid: `AH-IP-T-${stamp}-B`,
      name: "IP Test Patient B",
      phone: "9000000002",
      age: 31,
      gender: "FEMALE",
    },
  });

  bedA = await prisma.bed.create({
    data: {
      bedNumber: `GW-T-${stamp}-1`,
      ward: "Test General Ward",
      roomNo: "T1",
      dailyRatePaise: 150_000,
    },
  });
  bedB = await prisma.bed.create({
    data: {
      bedNumber: `ICU-T-${stamp}-1`,
      ward: "Test ICU",
      roomNo: "TC",
      dailyRatePaise: 800_000,
    },
  });
});

afterAll(async () => {
  const userIds = [admin.id, doctor.id, secondDoctor.id, reception.id, pharmacist.id];
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.bedTransfer.deleteMany({ where: { admissionId: { in: createdAdmissionIds } } });
  await prisma.progressNote.deleteMany({ where: { admissionId: { in: createdAdmissionIds } } });
  await prisma.admission.deleteMany({ where: { id: { in: createdAdmissionIds } } });
  if (createdInvoiceIds.length > 0) {
    await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
  }
  await prisma.bed.deleteMany({ where: { id: { in: [bedA.id, bedB.id] } } });
  await prisma.patient.deleteMany({ where: { uhid: { startsWith: `AH-IP-T-${stamp}` } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("IP management — stay arithmetic", () => {
  it("counts billed days inclusively with a one-day minimum", () => {
    const admitted = new Date("2026-01-01T00:00:00.000Z");
    expect(computeStayDays(admitted, new Date("2026-01-01T18:00:00.000Z"))).toBe(1);
    expect(computeStayDays(admitted, new Date("2026-01-03T09:00:00.000Z"))).toBe(3);
    expect(admissionNo(2026, 7)).toBe("AH-IP-2026-0007");
  });
});

describe("IP management — admissions", () => {
  it("admits a patient, generates a unique IP number and occupies the bed", async () => {
    const admission = await createAdmission(
      {
        patientId: patientA.id,
        admittingDoctorId: doctor.id,
        bedId: bedA.id,
        diagnosis: "Acute febrile illness",
        admissionDate: "2026-01-01",
      },
      reception,
    );
    createdAdmissionIds.push(admission.id);

    expect(admission.admissionNo).toMatch(/^AH-IP-\d{4}-\d{4}$/);
    expect(admission.status).toBe("ADMITTED");
    expect(admission.ward).toBe("Test General Ward");
    expect(admission.attendingDoctorId).toBe(doctor.id);

    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: bedA.id } });
    expect(bed.status).toBe("OCCUPIED");

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Admission", entityId: admission.id, action: "ADMISSION_CREATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses a bed that is already occupied and blocks non-IP roles", async () => {
    await expect(
      createAdmission(
        {
          patientId: patientB.id,
          admittingDoctorId: doctor.id,
          bedId: bedA.id,
          diagnosis: "Observation",
        },
        admin,
      ),
    ).rejects.toThrow(ApiError);

    await expect(
      createAdmission(
        {
          patientId: patientB.id,
          admittingDoctorId: doctor.id,
          bedId: bedB.id,
          diagnosis: "Observation",
        },
        pharmacist,
      ),
    ).rejects.toThrow(ApiError);
  });

  it("reassigns the treating doctor with an audit trail", async () => {
    const admissionId = createdAdmissionIds[0];
    const updated = await updateAdmission(
      admissionId,
      { attendingDoctorId: secondDoctor.id },
      doctor,
    );
    expect(updated.attendingDoctorId).toBe(secondDoctor.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Admission", entityId: admissionId, action: "ADMISSION_DOCTOR_ASSIGNED" },
    });
    expect(audit).not.toBeNull();
  });

  it("records daily progress notes with treatment details", async () => {
    const admissionId = createdAdmissionIds[0];
    const note = await addProgressNote(
      admissionId,
      { note: "Afebrile, appetite improving", treatment: "Continue IV fluids, oral antibiotics" },
      doctor,
    );

    expect(note.admissionId).toBe(admissionId);
    expect(note.treatment).toContain("IV fluids");

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Admission", entityId: admissionId, action: "IP_PROGRESS_NOTE_ADDED" },
    });
    expect(audit).not.toBeNull();
  });

  it("transfers the patient between wards and frees the old bed", async () => {
    const admissionId = createdAdmissionIds[0];
    const { admission, transfer } = await transferAdmission(
      admissionId,
      { toBedId: bedB.id, reason: "Needs monitoring" },
      doctor,
    );

    expect(admission.bedId).toBe(bedB.id);
    expect(admission.ward).toBe("Test ICU");
    expect(transfer.fromBedNumber).toBeTruthy();

    const [oldBed, newBed] = await Promise.all([
      prisma.bed.findUniqueOrThrow({ where: { id: bedA.id } }),
      prisma.bed.findUniqueOrThrow({ where: { id: bedB.id } }),
    ]);
    expect(oldBed.status).toBe("AVAILABLE");
    expect(newBed.status).toBe("OCCUPIED");

    const stored = await prisma.bedTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    expect(stored.admissionId).toBe(admissionId);
  });

  it("discharges the patient with a room-charge bill and frees the bed", async () => {
    const admissionId = createdAdmissionIds[0];
    const result = await dischargeAdmission(
      admissionId,
      {
        dischargeDate: "2026-01-03",
        dischargeType: "IMPROVED",
        dischargeSummary: "Treated for febrile illness; afebrile at discharge.",
        finalDiagnosis: "Viral fever",
        conditionAtDischarge: "Stable",
        createInvoice: true,
        billItems: [{ description: "Nursing charges", category: "SERVICE_CHARGES", amountRupees: 500 }],
      },
      admin,
    );

    // 3 days in the ICU bed at ₹8,000/day + ₹500 extras
    expect(result.days).toBe(3);
    expect(result.roomChargePaise).toBe(2_400_000);

    const admission = await prisma.admission.findUniqueOrThrow({ where: { id: admissionId } });
    expect(admission.status).toBe("DISCHARGED");
    expect(admission.invoiceId).toBeTruthy();
    expect(admission.finalDiagnosis).toBe("Viral fever");

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: admission.invoiceId! },
      include: { items: true },
    });
    createdInvoiceIds.push(invoice.id);
    expect(invoice.department).toBe("IP");
    expect(invoice.totalAmount).toBe(2_450_000);
    expect(invoice.items.some((item) => item.category === "ROOM_CHARGES")).toBe(true);

    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: bedB.id } });
    expect(bed.status).toBe("AVAILABLE");

    await expect(
      dischargeAdmission(
        admissionId,
        { dischargeType: "CURED", dischargeSummary: "Duplicate" },
        admin,
      ),
    ).rejects.toThrow(ApiError);
  });

  it("filters the admission list by search text and status", async () => {
    const admitted = await listAdmissions({ status: "ADMITTED" });
    expect(admitted.items.every((row) => row.status === "ADMITTED")).toBe(true);

    const found = await listAdmissions({ q: "IP Test Patient A" });
    expect(found.items.some((row) => row.id === createdAdmissionIds[0])).toBe(true);
  });
});
