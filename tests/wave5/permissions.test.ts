import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { authorize } from "@/modules/auth/authorize";
import {
  PERMISSION_KEYS,
  ROLE_PERMISSION_DEFAULTS,
  defaultPermissionsFor,
  isPermissionKey,
  resolvePermissions,
} from "@/modules/auth/permissions";
import { getPermissionsFor } from "@/modules/auth/permissions-service";
import { setUserPermissions, updateUser } from "@/modules/settings/service";

const stamp = Date.now();

let admin: User;
let reception: User;
const createdIds: string[] = [];

beforeAll(async () => {
  const hash = bcrypt.hashSync("TestPass123", 4);
  admin = await prisma.user.create({
    data: {
      name: "Perm Admin",
      email: `wave5-admin-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "ADMIN",
    },
  });
  reception = await prisma.user.create({
    data: {
      name: "Perm Reception",
      email: `wave5-reception-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "RECEPTION",
    },
  });
  createdIds.push(admin.id, reception.id);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: createdIds } }, { entityId: { in: createdIds } }] },
  });
  await prisma.userPermission.deleteMany({ where: { userId: { in: createdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
});

describe("Permission catalogue and role defaults", () => {
  it("exposes a valid, unique catalogue of permission keys", () => {
    expect(PERMISSION_KEYS.length).toBeGreaterThan(10);
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    expect(PERMISSION_KEYS.every(isPermissionKey)).toBe(true);
    expect(isPermissionKey("billing.delete")).toBe(false);
  });

  it("gives Admin every permission and never lets clinical roles into admin modules", () => {
    expect(defaultPermissionsFor("ADMIN").size).toBe(PERMISSION_KEYS.length);
    for (const role of ["RECEPTION", "BILLING_STAFF", "ACCOUNTS", "DOCTOR", "NURSE", "LAB_TECHNICIAN", "PHARMACIST"] as const) {
      const defaults = ROLE_PERMISSION_DEFAULTS[role];
      expect(defaults).not.toContain("users.manage");
      expect(defaults).not.toContain("settings.manage");
    }
    // Reconciliation is finance-only: Accounts and Admin. No clinical role.
    for (const role of ["RECEPTION", "BILLING_STAFF", "DOCTOR", "NURSE", "LAB_TECHNICIAN", "PHARMACIST"] as const) {
      expect(ROLE_PERMISSION_DEFAULTS[role]).not.toContain("billing.reconcile");
    }
    expect(ROLE_PERMISSION_DEFAULTS.ACCOUNTS).toContain("billing.reconcile");
  });

  it("matches the agreed module matrix", () => {
    expect(ROLE_PERMISSION_DEFAULTS.RECEPTION).toContain("patients.manage");
    expect(ROLE_PERMISSION_DEFAULTS.RECEPTION).not.toContain("billing.collect");
    expect(ROLE_PERMISSION_DEFAULTS.BILLING_STAFF).toContain("billing.collect");
    expect(ROLE_PERMISSION_DEFAULTS.ACCOUNTS).toContain("billing.reconcile");
    expect(ROLE_PERMISSION_DEFAULTS.ACCOUNTS).not.toContain("patients.view");
    expect(ROLE_PERMISSION_DEFAULTS.NURSE).not.toContain("billing.view");
    expect(ROLE_PERMISSION_DEFAULTS.LAB_TECHNICIAN).toContain("lab.results");
    expect(ROLE_PERMISSION_DEFAULTS.LAB_TECHNICIAN).toContain("lab.masters");
    expect(ROLE_PERMISSION_DEFAULTS.DOCTOR).not.toContain("lab.masters");
    expect(ROLE_PERMISSION_DEFAULTS.PHARMACIST).toContain("pharmacy.access");
  });
});

describe("Overrides", () => {
  it("grants and revokes on top of the role defaults", () => {
    const granted = resolvePermissions("RECEPTION", [
      { permission: "billing.collect", allowed: true },
    ]);
    expect(granted.has("billing.collect")).toBe(true);
    expect(granted.has("patients.manage")).toBe(true);

    const revoked = resolvePermissions("RECEPTION", [
      { permission: "patients.manage", allowed: false },
    ]);
    expect(revoked.has("patients.manage")).toBe(false);
    expect(revoked.has("patients.view")).toBe(true);
  });

  it("ignores unknown permission keys", () => {
    const result = resolvePermissions("NURSE", [
      { permission: "billing.delete", allowed: true },
    ]);
    expect([...result]).not.toContain("billing.delete");
    expect(result).toEqual(defaultPermissionsFor("NURSE"));
  });
});

describe("Admin permission management", () => {
  it("stores only deviations from the role defaults and audits the change", async () => {
    const desired = [
      ...ROLE_PERMISSION_DEFAULTS.RECEPTION,
      "billing.collect" as const,
    ].filter((key) => key !== "dental.access");

    const saved = await setUserPermissions(reception.id, { permissions: desired }, admin);

    expect(saved).toContain("billing.collect");
    expect(saved).not.toContain("dental.access");

    const rows = await prisma.userPermission.findMany({
      where: { userId: reception.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.permission === "billing.collect")?.allowed).toBe(true);
    expect(rows.find((row) => row.permission === "dental.access")?.allowed).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "USER_PERMISSIONS_UPDATED", entityId: reception.id },
    });
    expect(audit).not.toBeNull();
    expect((audit?.after as { permissions?: string[] })?.permissions).toContain(
      "billing.collect",
    );
  });

  it("resolves the saved overrides back into an effective permission set", async () => {
    const permissions = await getPermissionsFor(reception);
    expect(permissions.has("billing.collect")).toBe(true);
    expect(permissions.has("dental.access")).toBe(false);
    expect(permissions.has("users.manage")).toBe(false);
  });

  it("removes override rows when a permission returns to the role default", async () => {
    await setUserPermissions(
      reception.id,
      { permissions: [...ROLE_PERMISSION_DEFAULTS.RECEPTION] },
      admin,
    );
    const rows = await prisma.userPermission.findMany({
      where: { userId: reception.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("prevents an admin from editing their own permissions", async () => {
    await expect(
      setUserPermissions(admin.id, { permissions: ["patients.view"] }, admin),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects unknown permission keys", async () => {
    await expect(
      setUserPermissions(
        reception.id,
        { permissions: ["billing.delete"] } as never,
        admin,
      ),
    ).rejects.toThrow();
  });

  it("keeps the module permission guard meaningful for a denied role", () => {
    expect(
      authorize({ role: "RECEPTION", active: true }, ["ADMIN"]).ok,
    ).toBe(false);
    const receptionPermissions = defaultPermissionsFor("RECEPTION");
    expect(receptionPermissions.has("users.manage")).toBe(false);
    expect(receptionPermissions.has("settings.manage")).toBe(false);
  });

  it("applies a role change on top of existing overrides without losing them", async () => {
    await setUserPermissions(
      reception.id,
      { permissions: [...ROLE_PERMISSION_DEFAULTS.RECEPTION, "lab.access"] },
      admin,
    );
    const changed = await updateUser(reception.id, { role: "NURSE" }, admin);
    expect(changed.role).toBe("NURSE");

    const permissions = await getPermissionsFor({ ...reception, role: "NURSE" });
    // NURSE lacks lab.access by default, so the explicit grant survives.
    expect(permissions.has("lab.access")).toBe(true);
    expect(permissions.has("patients.manage")).toBe(false);
  });
});
