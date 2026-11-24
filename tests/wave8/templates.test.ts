import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  invoiceFooterText,
  receiptFooterText,
  termsBlock,
} from "@/modules/billing/templates";
import { updateHospitalSettingsSchema } from "@/modules/settings/schemas";
import { updateHospitalSettings } from "@/modules/settings/service";

const stamp = Date.now();
let admin: User;
let original: Awaited<ReturnType<typeof prisma.hospitalSettings.findFirst>>;

const baseInput = {
  hospitalName: "AHLAIN HOSPITAL",
  address: "12, Health Street, Kakkanad, Kochi",
  upiId: "ahlainhospital@upi",
};

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      name: "Template Admin",
      email: `wave8-admin-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("TestPass123", 4),
      role: "ADMIN",
    },
  });
  original = await prisma.hospitalSettings.findFirst();
});

afterAll(async () => {
  if (original) {
    await prisma.hospitalSettings.update({
      where: { id: original.id },
      data: {
        hospitalName: original.hospitalName,
        address: original.address,
        upiId: original.upiId,
        upiQrImageUrl: original.upiQrImageUrl,
        receiptFooter: original.receiptFooter,
        termsText: original.termsText,
      },
    });
  }
  await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
  await prisma.user.deleteMany({ where: { id: admin.id } });
});

describe("Printable document text", () => {
  it("falls back to the built-in receipt footer", () => {
    expect(receiptFooterText(null, "AHLAIN HOSPITAL")).toContain(
      "computer-generated receipt",
    );
    expect(receiptFooterText("   ", "AHLAIN HOSPITAL")).toContain(
      "computer-generated receipt",
    );
  });

  it("uses the custom footer when one is configured", () => {
    expect(receiptFooterText("Thank you for choosing us.", "AHLAIN HOSPITAL")).toBe(
      "Thank you for choosing us.",
    );
    expect(invoiceFooterText("Keep this invoice.", "AHLAIN HOSPITAL")).toBe(
      "Keep this invoice.",
    );
  });

  it("hides the terms block when the setting is blank", () => {
    expect(termsBlock("")).toBeNull();
    expect(termsBlock("   \n ")).toBeNull();
    expect(termsBlock(null)).toBeNull();
    expect(termsBlock("  Bills are payable within 7 days.  ")).toBe(
      "Bills are payable within 7 days.",
    );
  });
});

describe("Template settings validation", () => {
  it("accepts blank templates and trims whitespace", () => {
    const parsed = updateHospitalSettingsSchema.parse({
      ...baseInput,
      receiptFooter: "  Custom footer  ",
      termsText: "",
    });
    expect(parsed.receiptFooter).toBe("Custom footer");
    expect(parsed.termsText).toBe("");
  });

  it("rejects oversized footer and terms text", () => {
    const footer = updateHospitalSettingsSchema.safeParse({
      ...baseInput,
      receiptFooter: "x".repeat(301),
    });
    expect(footer.success).toBe(false);

    const terms = updateHospitalSettingsSchema.safeParse({
      ...baseInput,
      termsText: "x".repeat(501),
    });
    expect(terms.success).toBe(false);
  });
});

describe("Saving templates", () => {
  it("persists a custom receipt footer and terms block", async () => {
    const saved = await updateHospitalSettings(
      {
        ...baseInput,
        receiptFooter: "Thank you for choosing AHLAIN.",
        termsText: "Bills are payable within 7 days.",
      },
      admin,
    );

    expect(saved.receiptFooter).toBe("Thank you for choosing AHLAIN.");
    expect(saved.termsText).toBe("Bills are payable within 7 days.");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "SETTINGS_UPDATED", userId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.after as { termsText?: string })?.termsText).toBe(
      "Bills are payable within 7 days.",
    );
  });

  it("clears the templates when they are omitted", async () => {
    const saved = await updateHospitalSettings(
      { ...baseInput, receiptFooter: "", termsText: "" },
      admin,
    );
    expect(saved.receiptFooter).toBe("");
    expect(saved.termsText).toBe("");
    // A cleared setting still prints the built-in footer.
    expect(receiptFooterText(saved.receiptFooter, saved.hospitalName)).toContain(
      "computer-generated receipt",
    );
  });
});
