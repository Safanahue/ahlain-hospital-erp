import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { authorize } from "@/modules/auth/authorize";
import { LAB_REF_RANGE_MANAGE_ROLES } from "@/modules/auth/roles";
import {
  createReferenceRange,
  deleteReferenceRange,
  listReferenceRanges,
  updateReferenceRange,
} from "@/modules/laboratory/service";
import { buildDisplayRange } from "@/modules/laboratory/ranges";

const stamp = Date.now();
const TEST_NAME = `Custom Panel ${stamp}`;

let admin: User;
let labTech: User;
let reception: User;
const createdIds: string[] = [];
const createdServiceIds: string[] = [];

beforeAll(async () => {
  const hash = bcrypt.hashSync("test-password", 4);
  admin = await prisma.user.create({
    data: { name: "Range Admin", email: `wave4-range-admin-${stamp}@ahlain.test`, passwordHash: hash, role: "ADMIN" },
  });
  labTech = await prisma.user.create({
    data: { name: "Range Lab Incharge", email: `wave4-range-lab-${stamp}@ahlain.test`, passwordHash: hash, role: "LAB_TECHNICIAN" },
  });
  reception = await prisma.user.create({
    data: { name: "Range Reception", email: `wave4-range-reception-${stamp}@ahlain.test`, passwordHash: hash, role: "RECEPTION" },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: [admin.id, labTech.id, reception.id] } } });
  await prisma.labReferenceRange.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.labReferenceRange.deleteMany({ where: { testName: TEST_NAME } });
  if (createdServiceIds.length > 0) {
    await prisma.serviceCatalog.deleteMany({ where: { id: { in: createdServiceIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, labTech.id, reception.id] } } });
});

describe("Reference range library — display generation", () => {
  it("builds the display from min, max and unit", () => {
    expect(buildDisplayRange(70, 99, "mg/dL")).toBe("70 - 99 mg/dL");
    expect(buildDisplayRange(150000, 450000, "/mcL")).toBe("150,000 - 450,000 /mcL");
    expect(buildDisplayRange(null, 200, "mg/dL")).toBe("< 200 mg/dL");
    expect(buildDisplayRange(40, null, "mg/dL")).toBe("> 40 mg/dL");
    expect(buildDisplayRange(null, null, "mg/dL")).toBeNull();
  });
});

describe("Reference range library — roles", () => {
  it("lets the lab in-charge maintain ranges but not reception", () => {
    expect(LAB_REF_RANGE_MANAGE_ROLES).toContain("LAB_TECHNICIAN");
    expect(authorize({ role: "LAB_TECHNICIAN", active: true }, LAB_REF_RANGE_MANAGE_ROLES).ok).toBe(true);
    expect(authorize({ role: "RECEPTION", active: true }, LAB_REF_RANGE_MANAGE_ROLES).ok).toBe(false);
  });
});

describe("Reference range library — saved ranges", () => {
  it("saves a range with category, gender, age group and auto display", async () => {
    const range = await createReferenceRange(
      {
        testName: TEST_NAME,
        parameterName: "Total Bilirubin",
        gender: "Both",
        ageGroup: "Adult",
        minValue: 0.3,
        maxValue: 1.2,
        unit: "mg/dL",
        displayRange: "",
        category: "Biochemistry",
        sortOrder: 0,
        createService: true,
      },
      labTech,
    );
    createdIds.push(range.id);
    if (range.serviceId) createdServiceIds.push(range.serviceId);

    expect(range.displayRange).toBe("0.3 - 1.2 mg/dL");
    expect(range.category).toBe("Biochemistry");
    expect(range.serviceId).toBeTruthy();

    const service = await prisma.serviceCatalog.findUnique({ where: { id: range.serviceId! } });
    expect(service?.department).toBe("LAB");
    expect(service?.name).toBe(TEST_NAME);
  });

  it("stores several gender and age variants for the same parameter", async () => {
    const female = await createReferenceRange(
      {
        testName: TEST_NAME,
        parameterName: "Total Bilirubin",
        gender: "Female",
        ageGroup: "Adult",
        minValue: 0.2,
        maxValue: 1.1,
        unit: "mg/dL",
        category: "Biochemistry",
      },
      admin,
    );
    createdIds.push(female.id);

    const child = await createReferenceRange(
      {
        testName: TEST_NAME,
        parameterName: "Total Bilirubin",
        gender: "Both",
        ageGroup: "Child (6-12 yrs)",
        minValue: 0.2,
        maxValue: 1,
        unit: "mg/dL",
        category: "Biochemistry",
      },
      admin,
    );
    createdIds.push(child.id);

    const rows = await listReferenceRanges({ testName: TEST_NAME });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.gender).sort()).toEqual(["Both", "Both", "Female"]);
  });

  it("filters the library by category and search text", async () => {
    const byCategory = await listReferenceRanges({ category: "Biochemistry", q: TEST_NAME });
    expect(byCategory.length).toBe(3);

    const byParameter = await listReferenceRanges({ q: "Total Bilirubin" });
    expect(byParameter.some((row) => row.testName === TEST_NAME)).toBe(true);

    const byTestName = await listReferenceRanges({ q: TEST_NAME });
    expect(byTestName).toHaveLength(3);
  });

  it("updates a saved range and regenerates the display from new values", async () => {
    const id = createdIds[0];
    const updated = await updateReferenceRange(
      id,
      { maxValue: 1.4, displayRange: null },
      admin,
    );
    expect(updated.maxValue).toBe(1.4);
    expect(updated.displayRange).toBe("0.3 - 1.4 mg/dL");

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "LabReferenceRange", entityId: id, action: "LAB_REF_RANGE_UPDATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("blocks a non-authorized role from saving ranges", async () => {
    await expect(
      createReferenceRange(
        {
          testName: TEST_NAME,
          parameterName: "Blocked",
          gender: "Both",
          ageGroup: "Adult",
          minValue: 1,
          maxValue: 2,
          unit: "mg/dL",
        },
        reception,
      ),
    ).rejects.toThrow(ApiError);
  });

  it("keeps saved ranges after retrieving the library again", async () => {
    const rows = await listReferenceRanges({ testName: TEST_NAME });
    expect(rows.find((row) => row.parameterName === "Total Bilirubin")).toBeTruthy();

    await deleteReferenceRange(createdIds[2], admin);
    const after = await listReferenceRanges({ testName: TEST_NAME });
    expect(after).toHaveLength(2);
  });
});
