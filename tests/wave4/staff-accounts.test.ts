import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { SETTINGS_ROLES } from "@/modules/auth/roles";
import { authorize } from "@/modules/auth/authorize";
import {
  changeOwnPassword,
  createStaff,
  resetStaffPassword,
  updateUser,
} from "@/modules/settings/service";

const stamp = Date.now();
const emailFor = (label: string) => `wave4-${label}-${stamp}@ahlain.test`;

let admin: User;
let staff: User;
const createdIds: string[] = [];

beforeAll(async () => {
  const hash = bcrypt.hashSync("TestPass123", 4);
  admin = await prisma.user.create({
    data: {
      name: "Wave4 Admin",
      email: emailFor("admin"),
      passwordHash: hash,
      role: "ADMIN",
    },
  });
  createdIds.push(admin.id);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: createdIds } }, { entityId: { in: createdIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
});

describe("Staff account creation", () => {
  it("creates an account with a generated temporary password (hashed, never stored raw)", async () => {
    const result = await createStaff(
      {
        name: "Front Desk One",
        email: emailFor("reception").toUpperCase(),
        role: "RECEPTION",
      },
      admin,
    );
    createdIds.push(result.user.id);
    staff = result.user;

    expect(result.generated).toBe(true);
    expect(result.temporaryPassword).toHaveLength(10);
    expect(result.user.email).toBe(emailFor("reception"));
    expect(result.user.mustChangePassword).toBe(true);
    expect(result.user.tempPasswordIssuedAt).not.toBeNull();

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(stored.passwordHash).not.toContain(result.temporaryPassword);
    expect(await bcrypt.compare(result.temporaryPassword, stored.passwordHash)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_CREATED", entityId: result.user.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.after)).not.toContain(result.temporaryPassword);
  });

  it("rejects a duplicate email", async () => {
    await expect(
      createStaff(
        { name: "Duplicate", email: emailFor("reception"), role: "NURSE" },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a weak manually supplied temporary password", async () => {
    await expect(
      createStaff(
        {
          name: "Weak Password",
          email: emailFor("weak"),
          role: "NURSE",
          temporaryPassword: "password",
        },
        admin,
      ),
    ).rejects.toThrow();
  });

  it("accepts a strong manually supplied temporary password", async () => {
    const result = await createStaff(
      {
        name: "Lab Login",
        email: emailFor("lab"),
        role: "LAB_TECHNICIAN",
        temporaryPassword: "AhlainLab2026",
      },
      admin,
    );
    createdIds.push(result.user.id);
    expect(result.generated).toBe(false);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(await bcrypt.compare("AhlainLab2026", stored.passwordHash)).toBe(true);
    expect(stored.mustChangePassword).toBe(true);
  });
});

describe("Staff profile, role and activation", () => {
  it("edits name, email and role and audit logs the change", async () => {
    const updated = await updateUser(
      staff.id,
      { name: "Front Desk Two", email: emailFor("reception2"), role: "BILLING_STAFF" },
      admin,
    );
    expect(updated.name).toBe("Front Desk Two");
    expect(updated.email).toBe(emailFor("reception2"));
    expect(updated.role).toBe("BILLING_STAFF");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_UPDATED", entityId: staff.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.before as { role?: string })?.role).toBe("RECEPTION");
    expect((audit?.after as { role?: string })?.role).toBe("BILLING_STAFF");
  });

  it("deactivates and reactivates an account", async () => {
    const off = await updateUser(staff.id, { active: false }, admin);
    expect(off.active).toBe(false);
    const on = await updateUser(staff.id, { active: true }, admin);
    expect(on.active).toBe(true);
  });

  it("blocks an admin from changing their own role or deactivating themselves", async () => {
    await expect(updateUser(admin.id, { role: "NURSE" }, admin)).rejects.toBeInstanceOf(ApiError);
    await expect(updateUser(admin.id, { active: false }, admin)).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects an email already used by another account", async () => {
    await expect(
      updateUser(staff.id, { email: admin.email }, admin),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("Password reset and forced change", () => {
  it("resets the password to a new temporary one and keeps the forced-change flag", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    const result = await resetStaffPassword(staff.id, {}, admin);

    expect(result.generated).toBe(true);
    expect(result.user.mustChangePassword).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await bcrypt.compare(result.temporaryPassword, after.passwordHash)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_PASSWORD_RESET", entityId: staff.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.after)).not.toContain(result.temporaryPassword);
  });

  it("does not let an admin reset their own password through the staff endpoint", async () => {
    await expect(resetStaffPassword(admin.id, {}, admin)).rejects.toBeInstanceOf(ApiError);
  });

  it("requires the correct current password", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    await expect(
      changeOwnPassword(owner, {
        currentPassword: "WrongPass123",
        newPassword: "ChosenPass2026",
        confirmPassword: "ChosenPass2026",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sets the chosen password and clears the forced-change flag", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    const temp = "TempPass2026";
    const tempHash = await bcrypt.hash(temp, 4);
    await prisma.user.update({
      where: { id: staff.id },
      data: { passwordHash: tempHash, mustChangePassword: true },
    });

    await changeOwnPassword(
      { ...owner, passwordHash: tempHash, mustChangePassword: true },
      {
        currentPassword: temp,
        newPassword: "ChosenPass2026",
        confirmPassword: "ChosenPass2026",
      },
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(after.tempPasswordIssuedAt).toBeNull();
    expect(await bcrypt.compare("ChosenPass2026", after.passwordHash)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_PASSWORD_CHANGED", entityId: staff.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects mismatched or weak new passwords", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    await expect(
      changeOwnPassword(owner, {
        currentPassword: "ChosenPass2026",
        newPassword: "AnotherPass2026",
        confirmPassword: "Different2026",
      }),
    ).rejects.toThrow();

    await expect(
      changeOwnPassword(owner, {
        currentPassword: "ChosenPass2026",
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).rejects.toThrow();
  });
});

describe("Admin-only access", () => {
  it("keeps staff management restricted to Admin", () => {
    expect(SETTINGS_ROLES).toEqual(["ADMIN"]);
    expect(authorize({ role: "ADMIN", active: true }, SETTINGS_ROLES).ok).toBe(true);
    expect(authorize({ role: "RECEPTION", active: true }, SETTINGS_ROLES).ok).toBe(false);
    expect(authorize({ role: "BILLING_STAFF", active: true }, SETTINGS_ROLES).ok).toBe(false);
  });
});
