import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLabOrder, listLabOrders, updateLabOrder } from "@/modules/laboratory/service";
import { getOrderReport } from "@/modules/laboratory/results";
import { buildLabReportPdf } from "@/modules/laboratory/report-pdf";
import { getPatientClinicalHistory } from "@/modules/patients/history";
import { listReportDocuments } from "@/modules/laboratory/documents";

const stamp = Date.now();

let admin: User;
let doctor: User;
let patient: Patient;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const hash = bcrypt.hashSync("test-password", 4);
  admin = await prisma.user.create({
    data: {
      name: "Lab Module Admin",
      email: `wave14-lab-admin-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "ADMIN",
    },
  });
  doctor = await prisma.user.create({
    data: {
      name: "Lab Module Doctor",
      email: `wave14-lab-doctor-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "DOCTOR",
    },
  });
  patient = await prisma.patient.create({
    data: {
      uhid: `AH-LABTEST-${stamp}`,
      name: "Lab Module Test Patient",
      phone: "9000000099",
      age: 41,
      gender: "FEMALE",
    },
  });
});

afterAll(async () => {
  const userIds = [admin.id, doctor.id];
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.labOrder.updateMany({
    where: { id: { in: createdOrderIds } },
    data: { invoiceId: null },
  });
  await prisma.labOrderResult.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.labOrderTest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.labOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { patientId: patient.id } } });
  await prisma.invoice.deleteMany({ where: { patientId: patient.id } });
  await prisma.patient.deleteMany({ where: { id: patient.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Laboratory module", () => {
  it("registers several tests on one accession and raises a single LAB invoice", async () => {
    const order = await createLabOrder(
      {
        patientId: patient.id,
        orderedById: doctor.id,
        tests: [
          { testName: "Full Blood Count", department: "Haematology", priceRupees: 250 },
          { testName: "Lipid Profile", department: "Biochemistry", priceRupees: 450 },
        ],
        priority: "URGENT",
        sampleType: "Whole blood",
        sampleId: "VIAL-1",
      },
      admin,
    );
    createdOrderIds.push(order.id);

    expect(order.tests).toHaveLength(2);
    expect(order.costPaise).toBe(70_000);
    expect(order.priority).toBe("URGENT");

    const invoice = await prisma.invoice.findUnique({
      where: { id: order.invoiceId! },
      include: { items: true },
    });
    expect(invoice?.department).toBe("LAB");
    expect(invoice?.totalAmount).toBe(70_000);
    expect(invoice?.items).toHaveLength(2);
    expect(invoice?.items.every((item) => item.category === "LABORATORY")).toBe(true);
  });

  it("lists historical accessions without a date filter and searches by patient", async () => {
    const all = await listLabOrders({ page: 1, pageSize: 10, q: `AH-LABTEST-${stamp}` });
    expect(all.total).toBeGreaterThanOrEqual(1);
    expect(all.items[0]?.patient.uhid).toBe(`AH-LABTEST-${stamp}`);

    const filtered = await listLabOrders({ page: 1, pageSize: 10, status: "VERIFIED" });
    expect(filtered.items.every((order) => order.status === "VERIFIED")).toBe(true);
  });

  it("verifies the accession, stamps a report number and completes its tests", async () => {
    const id = createdOrderIds[0];
    const updated = await updateLabOrder(id, { status: "VERIFIED" }, admin);
    expect(updated.status).toBe("VERIFIED");
    expect(updated.reportNo).toBe(updated.orderNo);

    const tests = await prisma.labOrderTest.findMany({ where: { orderId: id } });
    expect(tests.every((test) => test.status === "VERIFIED")).toBe(true);
  });

  it("renders a real PDF report", async () => {
    const order = await getOrderReport(createdOrderIds[0]);
    expect(order).toBeTruthy();
    const bytes = await buildLabReportPdf(order!, {
      hospitalName: "AHLAIN HOSPITAL",
      addressLine1: "Manacaud, Trivandrum",
      phone: "0471 2080904",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("surfaces the lab history in the patient profile", async () => {
    const history = await getPatientClinicalHistory(patient.id);
    expect(history.labOrders.length).toBeGreaterThanOrEqual(1);
    expect(history.timeline.some((event) => event.type === "LAB")).toBe(true);
    expect(history.invoiceRows.some((invoice) => invoice.department === "LAB")).toBe(true);
  });

  it("finds archived report files by patient or report number", async () => {
    const document = await prisma.labReportDocument.create({
      data: {
        patientId: patient.id,
        filename: `wave14-${stamp}.pdf`,
        sourceFolder: "test",
        sha256: `test-${stamp}`,
        sizeBytes: 4,
        reportNo: `GP-TEST-${stamp}`,
        matchConfidence: "EXACT",
        bytes: new Uint8Array([37, 80, 68, 70]),
      },
    });

    const byReport = await listReportDocuments({ q: `GP-TEST-${stamp}` });
    expect(byReport.items.map((item) => item.id)).toContain(document.id);

    const unlinked = await listReportDocuments({ linked: "unlinked" });
    expect(unlinked.items.every((item) => item.patient === null)).toBe(true);

    await prisma.labReportDocument.delete({ where: { id: document.id } });
  });
});
