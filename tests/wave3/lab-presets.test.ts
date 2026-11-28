import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  updateTemplate,
} from "@/modules/laboratory/presets";
import { createLabOrder } from "@/modules/laboratory/service";
import { getOrderReport, saveOrderResults } from "@/modules/laboratory/results";
import {
  flagResult,
  formatReferenceRange,
  parseNumericResult,
  resolveRangeForPatient,
} from "@/modules/laboratory/ranges";

const stamp = Date.now();

let admin: User;
let reception: User;
let doctor: User;
let patient: Patient;
let templateId: string;
let orderId: string;

const createdTemplateIds: string[] = [];
const createdOrderIds: string[] = [];

const RANGES = [
  { gender: "Male" as const, ageMinYears: null, ageMaxYears: null, minValue: 13, maxValue: 17, displayRange: null, notes: null },
  { gender: "Female" as const, ageMinYears: null, ageMaxYears: null, minValue: 12, maxValue: 15, displayRange: null, notes: null },
  { gender: "Both" as const, ageMinYears: 1, ageMaxYears: 12, minValue: 11, maxValue: 14, displayRange: null, notes: "Child" },
];

beforeAll(async () => {
  const hash = bcrypt.hashSync("test-password", 4);
  admin = await prisma.user.create({
    data: { name: "Preset Admin", email: `wave3-preset-admin-${stamp}@ahlain.test`, passwordHash: hash, role: "ADMIN" },
  });
  reception = await prisma.user.create({
    data: { name: "Preset Reception", email: `wave3-preset-reception-${stamp}@ahlain.test`, passwordHash: hash, role: "RECEPTION" },
  });
  doctor = await prisma.user.create({
    data: { name: "Preset Doctor", email: `wave3-preset-doctor-${stamp}@ahlain.test`, passwordHash: hash, role: "DOCTOR" },
  });
  patient = await prisma.patient.create({
    data: {
      uhid: `AH-PRESET-${stamp}`,
      name: "Preset Test Patient",
      phone: "9000000010",
      age: 30,
      gender: "MALE",
    },
  });
});

afterAll(async () => {
  const userIds = [admin.id, reception.id, doctor.id];
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.labOrderResult.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  // createLabOrder now raises the LAB invoice in the same transaction.
  await prisma.labOrder.updateMany({
    where: { id: { in: createdOrderIds } },
    data: { invoiceId: null },
  });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { patientId: patient.id } } });
  await prisma.invoice.deleteMany({ where: { patientId: patient.id } });
  await prisma.labOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.labReportTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
  await prisma.patient.deleteMany({ where: { uhid: `AH-PRESET-${stamp}` } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Lab presets — reference range resolution", () => {
  it("picks the most specific age/gender interval", () => {
    expect(resolveRangeForPatient(RANGES, { age: 30, gender: "MALE" })?.minValue).toBe(13);
    expect(resolveRangeForPatient(RANGES, { age: 30, gender: "FEMALE" })?.minValue).toBe(12);
    expect(resolveRangeForPatient(RANGES, { age: 8, gender: "MALE" })?.minValue).toBe(11);
    expect(resolveRangeForPatient([], { age: 30, gender: "MALE" })).toBeNull();
  });

  it("formats the interval with its unit and flags readings without diagnosing", () => {
    const male = resolveRangeForPatient(RANGES, { age: 30, gender: "MALE" })!;
    expect(formatReferenceRange(male, "g/dL")).toBe("13 – 17 g/dL");

    expect(flagResult(18.4, male)).toBe("HIGH");
    expect(flagResult(11.2, male)).toBe("LOW");
    expect(flagResult(14, male)).toBe("NORMAL");
    expect(flagResult(null, male)).toBe("NONE");

    expect(parseNumericResult("7,200 /mcL")).toBe(7200);
    expect(parseNumericResult("Negative")).toBeNull();
  });
});

describe("Lab presets — CRUD", () => {
  it("refuses preset management from a non-lab role", async () => {
    await expect(
      createTemplate(
        {
          name: `CBC guard ${stamp}`,
          category: "Haematology",
          parameters: [{ section: "Haematology", name: "Hb", unit: "g/dL", ranges: RANGES }],
        },
        reception,
      ),
    ).rejects.toThrow(ApiError);
  });

  it("creates a preset with parameters and age/gender ranges", async () => {
    const template = await createTemplate(
      {
        name: `CBC test ${stamp}`,
        category: "Haematology",
        description: "Test preset",
        parameters: [
          { section: "Haematology", name: "Haemoglobin (Hb)", unit: "g/dL", ranges: RANGES },
          {
            section: "Haematology",
            name: "Total WBC Count",
            unit: "/mcL",
            ranges: [
              { gender: "Both", minValue: 4000, maxValue: 11000, displayRange: null, notes: null },
            ],
          },
        ],
      },
      admin,
    );
    templateId = template.id;
    createdTemplateIds.push(template.id);

    expect(template.parameters).toHaveLength(2);
    expect(template.parameters[0].ranges).toHaveLength(3);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "LabReportTemplate", entityId: template.id, action: "LAB_TEMPLATE_CREATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("duplicates a preset under a new name", async () => {
    const copy = await duplicateTemplate(templateId, {}, admin);
    createdTemplateIds.push(copy.id);

    expect(copy.id).not.toBe(templateId);
    expect(copy.name).toContain("(Copy)");
    expect(copy.parameters).toHaveLength(2);
  });

  it("edits parameters and reference ranges", async () => {
    const updated = await updateTemplate(
      templateId,
      {
        parameters: [
          {
            section: "Haematology",
            name: "Haemoglobin (Hb)",
            unit: "g/dL",
            ranges: [
              { gender: "Male", minValue: 13.5, maxValue: 17.5, displayRange: null, notes: null },
              { gender: "Female", minValue: 12, maxValue: 15.5, displayRange: null, notes: null },
            ],
          },
        ],
      },
      admin,
    );

    expect(updated.parameters).toHaveLength(1);
    const male = updated.parameters[0].ranges.find((range) => range.gender === "Male");
    expect(male?.minValue).toBe(13.5);

    const fetched = await getTemplate(templateId);
    expect(fetched?.parameters).toHaveLength(1);
  });
});

describe("Lab results — preset entry and printable report", () => {
  it("snapshots results, units, ranges and server-computed flags", async () => {
    const template = await getTemplate(templateId);
    const hb = template!.parameters[0];

    const order = await createLabOrder(
      {
        patientId: patient.id,
        orderedById: doctor.id,
        testName: template!.name,
        sampleType: "Whole Blood",
        costRupees: 250,
      },
      admin,
    );
    orderId = order.id;
    createdOrderIds.push(order.id);

    const saved = await saveOrderResults(
      orderId,
      {
        templateId,
        findings: "Reviewed",
        results: [
          {
            parameterId: hb.id,
            section: hb.section,
            parameterName: hb.name,
            resultValue: "18.2",
            unit: hb.unit,
            // A client-supplied flag must be ignored — the server recomputes it.
            flag: "NONE",
            sortOrder: 0,
          },
        ],
      },
      admin,
    );

    expect(saved.order.status).toBe("RESULT_ENTERED");
    expect(saved.results[0].flag).toBe("HIGH");
    expect(saved.results[0].referenceRange).toBe("13.5 – 17.5 g/dL");
    expect(saved.results[0].unit).toBe("g/dL");

    const report = await getOrderReport(orderId);
    expect(report?.results).toHaveLength(1);
    expect(report?.template?.name).toBe(template!.name);
    expect(report?.patient.uhid).toBe(patient.uhid);
  });

  it("keeps issued results when the preset is later deleted", async () => {
    await deleteTemplate(templateId, admin);

    const report = await getOrderReport(orderId);
    expect(report?.results).toHaveLength(1);
    expect(report?.results[0].resultValue).toBe("18.2");
    expect(report?.results[0].parameterId).toBeNull();
  });
});
