import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateHospitalSettingsSchema } from "@/modules/settings/schemas";
import { saveBrandLogo, updateHospitalSettings } from "@/modules/settings/service";

const stamp = Date.now();
let admin: User;
let original: Awaited<ReturnType<typeof prisma.hospitalSettings.findFirst>>;
let uploadedUrl: string | null = null;

const baseInput = {
  hospitalName: "AHLAIN HOSPITAL",
  address: "12, Health Street, Kakkanad, Kochi",
  upiId: "ahlainhospital@upi",
  receiptFooter: "",
  termsText: "",
};

// Smallest valid PNG (1×1 transparent pixel).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function imageFile(name: string, type: string, bytes: Buffer) {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      name: "Branding Admin",
      email: `wave10-admin-${stamp}@ahlain.test`,
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
        logoImageUrl: original.logoImageUrl,
      },
    });
  }
  if (uploadedUrl) {
    await unlink(path.join(process.cwd(), "public", uploadedUrl)).catch(() => null);
  }
  await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
  await prisma.user.deleteMany({ where: { id: admin.id } });
});

describe("Logo setting validation", () => {
  it("accepts a blank or relative logo path", () => {
    expect(
      updateHospitalSettingsSchema.parse({ ...baseInput, logoImageUrl: "" }).logoImageUrl,
    ).toBe("");
    expect(
      updateHospitalSettingsSchema.parse({
        ...baseInput,
        logoImageUrl: "/uploads/logo-1.png",
      }).logoImageUrl,
    ).toBe("/uploads/logo-1.png");
  });

  it("rejects an oversized path", () => {
    const parsed = updateHospitalSettingsSchema.safeParse({
      ...baseInput,
      logoImageUrl: `/uploads/${"x".repeat(300)}.png`,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("Saving settings", () => {
  it("keeps the current logo when the field is omitted", async () => {
    await updateHospitalSettings(
      { ...baseInput, logoImageUrl: "/uploads/logo-existing.png" },
      admin,
    );

    const saved = await updateHospitalSettings({ ...baseInput }, admin);
    expect(saved.logoImageUrl).toBe("/uploads/logo-existing.png");
  });

  it("clears the logo when an empty value is supplied", async () => {
    const saved = await updateHospitalSettings(
      { ...baseInput, logoImageUrl: "" },
      admin,
    );
    expect(saved.logoImageUrl).toBe("");
  });
});

describe("Logo upload", () => {
  it("rejects unsupported file types before writing anything", async () => {
    await expect(
      saveBrandLogo(
        imageFile("logo.txt", "text/plain", Buffer.from("not an image")),
        admin,
      ),
    ).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("rejects files over 2 MB", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
    await expect(
      saveBrandLogo(imageFile("big.png", "image/png", big), admin),
    ).rejects.toThrow(/smaller than 2 MB/);
  });

  it("stores a valid image, points the settings at it and audits the change", async () => {
    const url = await saveBrandLogo(imageFile("logo.png", "image/png", PNG_BYTES), admin);
    uploadedUrl = url;

    expect(url).toMatch(/^\/uploads\/logo-\d+\.png$/);

    const settings = await prisma.hospitalSettings.findFirstOrThrow();
    expect(settings.logoImageUrl).toBe(url);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "BRAND_LOGO_UPDATED", userId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ logoImageUrl: url });
  });
});
