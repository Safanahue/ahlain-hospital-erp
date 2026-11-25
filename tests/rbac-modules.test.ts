import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PERMISSION_KEYS,
  ROLE_PERMISSION_DEFAULTS,
  resolvePermissions,
  type PermissionKey,
} from "@/modules/auth/permissions";
import { getPermissionsFor } from "@/modules/auth/permissions-service";
import { requireModulePermission } from "@/modules/auth/require-permission";
import { landingPathForRole, safeInternalPath } from "@/modules/auth/landing";
import { NAV_ITEMS } from "@/modules/shared/nav";
import { STAFF_ROLE_OPTIONS } from "@/modules/auth/roles";

const stamp = Date.now();
const emailFor = (label: string) => `rbac-${label}-${stamp}@ahlain.test`;

let users: Record<string, User> = {};
const createdIds: string[] = [];

const ROLES: Record<string, Role> = {
  admin: "ADMIN",
  pharmacy: "PHARMACIST",
  lab: "LAB_TECHNICIAN",
  reception: "RECEPTION",
  doctor: "DOCTOR",
  accountant: "ACCOUNTS",
};

beforeAll(async () => {
  for (const [label, role] of Object.entries(ROLES)) {
    const user = await prisma.user.create({
      data: {
        name: `RBAC ${label}`,
        email: emailFor(label),
        passwordHash: "not-a-real-hash",
        role,
      },
    });
    users[label] = user;
    createdIds.push(user.id);
  }
});

afterAll(async () => {
  await prisma.userPermission.deleteMany({ where: { userId: { in: createdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
});

/** Nav items visible for a role's default permissions (same filter as the sidebar). */
function visibleHrefs(role: Role): string[] {
  const allowed = new Set(ROLE_PERMISSION_DEFAULTS[role]);
  return NAV_ITEMS.filter((item) => !item.permission || allowed.has(item.permission)).map(
    (item) => item.href,
  );
}

async function allowed(actor: User, permission: PermissionKey): Promise<boolean> {
  try {
    await requireModulePermission(actor, permission);
    return true;
  } catch {
    return false;
  }
}

describe("RBAC — pharmacy and laboratory module access", () => {
  it("gives Admin every permission", () => {
    expect(new Set(ROLE_PERMISSION_DEFAULTS.ADMIN)).toEqual(new Set(PERMISSION_KEYS));
  });

  it("gives Pharmacist the pharmacy module only", () => {
    const perms = new Set(ROLE_PERMISSION_DEFAULTS.PHARMACIST);
    expect(perms.has("pharmacy.access")).toBe(true);
    expect(perms.has("lab.access")).toBe(false);
    expect(perms.has("lab.results")).toBe(false);
    expect(perms.has("lab.masters")).toBe(false);
    expect(perms.has("patients.view")).toBe(true);
  });

  it("gives Lab Technician the laboratory module only", () => {
    const perms = new Set(ROLE_PERMISSION_DEFAULTS.LAB_TECHNICIAN);
    expect(perms.has("lab.access")).toBe(true);
    expect(perms.has("lab.results")).toBe(true);
    expect(perms.has("lab.masters")).toBe(true);
    expect(perms.has("pharmacy.access")).toBe(false);
  });

  it("keeps Reception, Doctor and Accounts out of pharmacy stock control", () => {
    for (const role of ["RECEPTION", "DOCTOR", "ACCOUNTS"] as const) {
      expect(ROLE_PERMISSION_DEFAULTS[role]).not.toContain("pharmacy.access");
    }
  });

  it("lets only Admin, Doctor and Lab Technician see laboratory orders", () => {
    for (const role of ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"] as const) {
      expect(ROLE_PERMISSION_DEFAULTS[role]).toContain("lab.access");
    }
    for (const role of ["RECEPTION", "PHARMACIST", "ACCOUNTS"] as const) {
      expect(ROLE_PERMISSION_DEFAULTS[role]).not.toContain("lab.access");
    }
  });

  it("shows the correct sidebar modules per role", () => {
    expect(visibleHrefs("ADMIN")).toEqual(expect.arrayContaining(["/pharmacy", "/laboratory"]));
    expect(visibleHrefs("PHARMACIST")).toContain("/pharmacy");
    expect(visibleHrefs("PHARMACIST")).not.toContain("/laboratory");
    expect(visibleHrefs("LAB_TECHNICIAN")).toContain("/laboratory");
    expect(visibleHrefs("LAB_TECHNICIAN")).not.toContain("/pharmacy");
    for (const role of ["RECEPTION", "ACCOUNTS"] as const) {
      expect(visibleHrefs(role)).not.toContain("/pharmacy");
      expect(visibleHrefs(role)).not.toContain("/laboratory");
    }
    // Doctors order and review labs but do not run the pharmacy counter.
    expect(visibleHrefs("DOCTOR")).toContain("/laboratory");
    expect(visibleHrefs("DOCTOR")).not.toContain("/pharmacy");
  });

  it("sends pharmacy and lab staff to their own module after sign-in", () => {
    expect(landingPathForRole("PHARMACIST")).toBe("/pharmacy");
    expect(landingPathForRole("LAB_TECHNICIAN")).toBe("/laboratory");
    expect(landingPathForRole("ADMIN")).toBe("/");
    expect(safeInternalPath("//evil.example")).toBeNull();
  });

  it("offers Pharmacist and Lab Technician as assignable staff roles", () => {
    const values = STAFF_ROLE_OPTIONS.map((option) => option.value);
    expect(values).toEqual(
      expect.arrayContaining(["ADMIN", "DOCTOR", "RECEPTION", "PHARMACIST", "LAB_TECHNICIAN"]),
    );
    expect(new Set(values).size).toBe(values.length);
  });

  it("enforces pharmacy access in the service layer for all six account types", async () => {
    expect(await allowed(users.admin, "pharmacy.access")).toBe(true);
    expect(await allowed(users.pharmacy, "pharmacy.access")).toBe(true);
    expect(await allowed(users.lab, "pharmacy.access")).toBe(false);
    expect(await allowed(users.reception, "pharmacy.access")).toBe(false);
    expect(await allowed(users.doctor, "pharmacy.access")).toBe(false);
    expect(await allowed(users.accountant, "pharmacy.access")).toBe(false);
  });

  it("enforces laboratory orders, results and masters separately", async () => {
    expect(await allowed(users.lab, "lab.access")).toBe(true);
    expect(await allowed(users.lab, "lab.results")).toBe(true);
    expect(await allowed(users.lab, "lab.masters")).toBe(true);

    expect(await allowed(users.pharmacy, "lab.access")).toBe(false);
    expect(await allowed(users.reception, "lab.access")).toBe(false);
    expect(await allowed(users.accountant, "lab.access")).toBe(false);

    // Doctors may order and enter results, but not maintain lab masters.
    expect(await allowed(users.doctor, "lab.access")).toBe(true);
    expect(await allowed(users.doctor, "lab.results")).toBe(true);
    expect(await allowed(users.doctor, "lab.masters")).toBe(false);

    expect(await allowed(users.admin, "lab.masters")).toBe(true);
  });

  it("honours admin-granted and admin-revoked permissions immediately", async () => {
    await prisma.userPermission.create({
      data: { userId: users.reception.id, permission: "pharmacy.access", allowed: true },
    });
    expect(await allowed(users.reception, "pharmacy.access")).toBe(true);

    await prisma.userPermission.create({
      data: { userId: users.pharmacy.id, permission: "pharmacy.access", allowed: false },
    });
    expect(await allowed(users.pharmacy, "pharmacy.access")).toBe(false);

    // Same resolution the sidebar/page guards use.
    const receptionPerms = await getPermissionsFor(users.reception);
    expect(receptionPerms.has("pharmacy.access")).toBe(true);

    const resolved = resolvePermissions("RECEPTION", [
      { permission: "lab.access", allowed: true },
    ]);
    expect(resolved.has("lab.access")).toBe(true);
  });
});
