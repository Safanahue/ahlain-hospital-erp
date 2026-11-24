import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateHospitalSettingsSchema } from "@/modules/settings/schemas";
import {
  saveSignatureImage,
  updateHospitalSettings,
} from "@/modules/settings/service";

const stamp = Date.now();
let admin: User;
let original: Awaited<ReturnType<typeof prisma.hospitalSettings.findFirst>>;
let uploadedUrl: string | null = null;

const baseInput = {
  hospitalName: "AHLAIN HOSPITAL",
  address: "TC: 68/2136, Kamaleswaram",
  upiId: "ahlainhospital@upi",
  receiptFooter: "",
  termsText: "",
};

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      name: "Branding Docs Admin",
      email: `wave11-admin-${stamp}@ahlain.test`,
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
        receiptFooter: original.receiptFooter,
        termsText: original.termsText,
        logoImageUrl: original.logoImageUrl,
        tagline: original.tagline,
        phone: original.phone,
        email: original.email,
        website: original.website,
        gstin: original.gstin,
        signatureImageUrl: original.signatureImageUrl,
      },
    });
  }
  if (uploadedUrl) {
    await unlink(path.join(process.cwd(), "public", uploadedUrl)).catch(() => null);
  }
  await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
  await prisma.user.deleteMany({ where: { id: admin.id } });
});

describe("Hospital branding settings validation", () => {
  it("accepts tagline, contact details, website and GSTIN", () => {
    const parsed = updateHospitalSettingsSchema.parse({
      ...baseInput,
      tagline: "New Horizons, Better Health.",
      phone: "+91 471 000 0000",
      email: "reception@ahlainhospital.in",
      website: "www.ahlainhospital.in",
      gstin: "32ABCDE1234F1Z5",
    });
    expect(parsed.tagline).toBe("New Horizons, Better Health.");
    expect(parsed.email).toBe("reception@ahlainhospital.in");
    expect(parsed.gstin).toBe("32ABCDE1234F1Z5");
  });

  it("allows blank optional contact fields", () => {
    const parsed = updateHospitalSettingsSchema.parse(baseInput);
    expect(parsed.tagline ?? "").toBe("");
    expect(parsed.phone ?? "").toBe("");
  });

  it("rejects an invalid email address", () => {
    expect(() =>
      updateHospitalSettingsSchema.parse({ ...baseInput, email: "not-an-email" }),
    ).toThrow();
  });
});

describe("Hospital branding settings persistence", () => {
  it("stores and returns every document branding field", async () => {
    await updateHospitalSettings(
      {
        ...baseInput,
        tagline: "New Horizons, Better Health.",
        phone: "+91 471 555 0100",
        email: "care@ahlainhospital.in",
        website: "www.ahlainhospital.in",
        gstin: "32ABCDE1234F1Z5",
      },
      admin,
    );

    const saved = await prisma.hospitalSettings.findFirstOrThrow();
    expect(saved.tagline).toBe("New Horizons, Better Health.");
    expect(saved.phone).toBe("+91 471 555 0100");
    expect(saved.email).toBe("care@ahlainhospital.in");
    expect(saved.website).toBe("www.ahlainhospital.in");
    expect(saved.gstin).toBe("32ABCDE1234F1Z5");
  });

  it("keeps an existing signature when the field is omitted", async () => {
    const before = await updateHospitalSettings(
      { ...baseInput, signatureImageUrl: "/uploads/signature-kept.png" },
      admin,
    );
    expect(before.signatureImageUrl).toBe("/uploads/signature-kept.png");

    await updateHospitalSettings({ ...baseInput, tagline: "Updated" }, admin);
    const saved = await prisma.hospitalSettings.findFirstOrThrow();
    expect(saved.signatureImageUrl).toBe("/uploads/signature-kept.png");
  });
});

describe("Authorised signature upload", () => {
  it("rejects a non-image upload", async () => {
    const file = new File([new Uint8Array(Buffer.from("hello"))], "sig.txt", {
      type: "text/plain",
    });
    await expect(saveSignatureImage(file, admin)).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("stores the signature and writes an audit entry", async () => {
    const file = new File([new Uint8Array(PNG_BYTES)], "signature.png", {
      type: "image/png",
    });
    uploadedUrl = await saveSignatureImage(file, admin);

    expect(uploadedUrl).toMatch(/^\/uploads\/signature-\d+\.png$/);
    const saved = await prisma.hospitalSettings.findFirstOrThrow();
    expect(saved.signatureImageUrl).toBe(uploadedUrl);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: admin.id, action: "BRAND_SIGNATURE_UPDATED" },
    });
    expect(audit).not.toBeNull();
  });
});
