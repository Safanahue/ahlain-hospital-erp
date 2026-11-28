import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Medicine, Patient, Prescription, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import {
  cancelPrescription,
  createPrescription,
  dispensePrescription,
  recordStockMovement,
} from "@/modules/pharmacy/service";
import {
  listMedicinesPaged,
  listPrescriptionsPaged,
  mapInvoicesToPrescriptions,
  getPharmacyStats,
  listStockMovements,
} from "@/modules/pharmacy/queries";

const stamp = Date.now();
let actor: User;
let patient: Patient;
let medicine: Medicine;
let prescription: Prescription;

beforeAll(async () => {
  actor = await prisma.user.create({
    data: {
      name: "Pharmacy Test Admin",
      email: `pharmacy-test-${stamp}@ahlain.test`,
      passwordHash: await bcrypt.hash("Test@12345", 4),
      role: "ADMIN",
      active: true,
    },
  });

  patient = await prisma.patient.create({
    data: {
      uhid: `AH-TEST-${stamp}`,
      name: `TEST Pharmacy ${stamp}`,
      phone: "9000000123",
      age: 30,
      gender: "MALE",
    },
  });

  medicine = await prisma.medicine.create({
    data: {
      itemCode: `MED-TEST-${stamp}`,
      name: `Test Paracetamol ${stamp}`,
      category: "Tablet",
      batchNumber: `BATCH-TEST-${stamp}`,
      expiryDate: new Date("2028-12-31"),
      stockQuantity: 10,
      unitPricePaise: 5000,
    },
  });

  prescription = await createPrescription(
    {
      patientId: patient.id,
      prescribedBy: "Dr. Test",
      items: [{ medicineId: medicine.id, quantity: 3, dosage: "1-0-1" }],
    },
    actor,
  );
});

afterAll(async () => {
  const invoices = await prisma.invoice.findMany({
    where: { patientId: patient.id },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);

  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });

  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: prescription.id } });
  await prisma.prescription.deleteMany({ where: { id: prescription.id } });
  await prisma.medicine.deleteMany({ where: { id: medicine.id } });
  await prisma.patient.deleteMany({ where: { id: patient.id } });
  await prisma.auditLog.deleteMany({ where: { userId: actor.id } });
  await prisma.user.deleteMany({ where: { id: actor.id } });
});

describe("pharmacy stock register", () => {
  it("lists medicines with pagination and search", async () => {
    const result = await listMedicinesPaged({
      page: 1,
      pageSize: 5,
      q: `Test Paracetamol ${stamp}`,
      stock: "all",
      includeInactive: false,
    } as never);

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(medicine.id);
    expect(result.pageSize).toBe(5);
  });

  it("records a stock receipt and a stock issue", async () => {
    const receipt = await recordStockMovement(
      medicine.id,
      { kind: "RECEIPT", quantity: 5, reason: "Purchase invoice TEST-1" },
      actor,
    );
    expect(receipt.medicine.stockQuantity).toBe(15);

    const issue = await recordStockMovement(
      medicine.id,
      { kind: "ISSUE", quantity: 2, reason: "Damaged strip" },
      actor,
    );
    expect(issue.medicine.stockQuantity).toBe(13);

    const ledger = await listStockMovements(medicine.id);
    expect(ledger.some((m) => m.action === "MEDICINE_STOCK_RECEIPT")).toBe(true);
    expect(ledger.some((m) => m.action === "MEDICINE_STOCK_ISSUE")).toBe(true);
  });

  it("refuses a movement that would make stock negative", async () => {
    await expect(
      recordStockMovement(
        medicine.id,
        { kind: "ISSUE", quantity: 500, reason: "Impossible issue" },
        actor,
      ),
    ).rejects.toBeInstanceOf(ApiError);

    const fresh = await prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id } });
    expect(fresh.stockQuantity).toBe(13);
  });

  it("dispenses the prescription, deducts stock and creates one pharmacy invoice", async () => {
    const result = await dispensePrescription(prescription.id, actor);

    expect(result.prescription.status).toBe("DISPENSED");
    expect(result.invoice).not.toBeNull();

    const fresh = await prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id } });
    expect(fresh.stockQuantity).toBe(10); // 13 − 3

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoice!.id },
      include: { items: true },
    });
    expect(invoice.department).toBe("PHARMACY");
    expect(invoice.totalAmount).toBe(15000); // 3 × ₹50
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].category).toBe("PHARMACY");
    expect(invoice.items[0].description).toContain(prescription.dispenseNo);
  });

  it("refuses to dispense the same prescription twice", async () => {
    await expect(dispensePrescription(prescription.id, actor)).rejects.toBeInstanceOf(ApiError);
    const fresh = await prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id } });
    expect(fresh.stockQuantity).toBe(10);
  });

  it("does not create a duplicate invoice when billing is rechecked", async () => {
    const invoices = await prisma.invoice.findMany({
      where: { patientId: patient.id, department: "PHARMACY" },
    });
    expect(invoices).toHaveLength(1);

    const page = await listPrescriptionsPaged({
      page: 1,
      pageSize: 10,
      status: "ALL",
    } as never);
    const row = page.items.find((r) => r.id === prescription.id);
    expect(row).toBeDefined();

    const map = await mapInvoicesToPrescriptions([row!]);
    expect(map.get(prescription.id)?.invoiceNo).toBe(invoices[0].invoiceNo);
  });

  it("returns a dispensed prescription to stock and cancels the invoice", async () => {
    const result = await cancelPrescription(
      prescription.id,
      { reason: "Patient returned the medicines" },
      actor,
    );

    expect(result.prescription.status).toBe("CANCELLED");

    const fresh = await prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id } });
    expect(fresh.stockQuantity).toBe(13); // 10 + 3 restored

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { patientId: patient.id, department: "PHARMACY" },
    });
    expect(invoice.status).toBe("CANCELLED");
  });

  it("refuses to cancel the same prescription twice", async () => {
    await expect(
      cancelPrescription(prescription.id, { reason: "again" }, actor),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("keeps the dashboard counters consistent", async () => {
    const stats = await getPharmacyStats();
    expect(stats.catalogueItems).toBeGreaterThan(0);
    expect(stats.pendingPrescriptions).toBeGreaterThanOrEqual(0);
    expect(stats.stockUnits).toBeGreaterThanOrEqual(0);
  });
});
