import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { SERVICE_MANAGE_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import {
  createServiceSchema,
  serviceListQuerySchema,
  updateServiceSchema,
  type CreateServiceInput,
} from "@/modules/catalog/schemas";
import { createService, updateService } from "@/modules/catalog/service";
import { listServices } from "@/modules/catalog/queries";

const stamp = Date.now();
/** Short suffix so generated codes stay within the 20-char code limit. */
const sfx = stamp.toString(36);

let manager: User; // Billing Staff — can manage the catalog
let viewer: User; // Reception — can view, cannot manage
let outsider: User; // Pharmacist — no catalog access at all

beforeAll(async () => {
  manager = await prisma.user.create({
    data: {
      name: "Test Catalog Manager",
      email: `catalog-manager-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "BILLING_STAFF",
    },
  });
  viewer = await prisma.user.create({
    data: {
      name: "Test Catalog Viewer",
      email: `catalog-viewer-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "RECEPTION",
    },
  });
  outsider = await prisma.user.create({
    data: {
      name: "Test Catalog Outsider",
      email: `catalog-outsider-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "PHARMACIST",
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      userId: { in: [manager.id, viewer.id, outsider.id] },
      entity: "ServiceCatalog",
    },
  });
  await prisma.serviceCatalog.deleteMany({
    where: { code: { startsWith: `TST-${sfx.toUpperCase()}` } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [manager.id, viewer.id, outsider.id] } },
  });
  await prisma.$disconnect();
});

const baseInput = (
  overrides: Partial<CreateServiceInput> = {},
): CreateServiceInput => ({
  code: `TST-${sfx}-a`,
  name: "Test Service",
  description: "Created by wave0 catalog tests",
  department: "OP",
  category: "SERVICE_CHARGES",
  pricePaise: 10_000,
  active: true,
  ...overrides,
});

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  messagePattern: RegExp,
) {
  try {
    await promise;
    throw new Error("expected the operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.message).toMatch(messagePattern);
  }
}

async function lastAudit(entityId: string) {
  return prisma.auditLog.findFirst({
    where: { entity: "ServiceCatalog", entityId },
    orderBy: { createdAt: "desc" },
  });
}

describe("service catalog zod validation", () => {
  it("rejects a negative price", () => {
    expect(
      createServiceSchema.safeParse(baseInput({ pricePaise: -100 })).success,
    ).toBe(false);
  });

  it("rejects a non-integer price", () => {
    expect(
      createServiceSchema.safeParse(baseInput({ pricePaise: 100.5 })).success,
    ).toBe(false);
  });

  it("rejects invalid department and category enum values", () => {
    expect(
      createServiceSchema.safeParse({ ...baseInput(), department: "FINANCE" })
        .success,
    ).toBe(false);
    expect(
      createServiceSchema.safeParse({
        ...baseInput(),
        code: `TST-${stamp}-2`,
        category: "NOT_A_CATEGORY",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty name and an invalid list filter", () => {
    expect(createServiceSchema.safeParse(baseInput({ name: " " })).success).toBe(
      false,
    );
    expect(
      serviceListQuerySchema.safeParse({ active: "maybe" }).success,
    ).toBe(false);
    expect(
      serviceListQuerySchema.safeParse({ department: "CARDIOLOGY" }).success,
    ).toBe(false);
  });

  it("uppercases codes and accepts a zero price", () => {
    const parsed = createServiceSchema.parse(
      baseInput({ code: `tst-${sfx}-z`, pricePaise: 0 }),
    );
    expect(parsed.code).toBe(`TST-${sfx.toUpperCase()}-Z`);
    expect(parsed.pricePaise).toBe(0);
  });

  it("rejects an empty update payload", () => {
    expect(updateServiceSchema.safeParse({}).success).toBe(false);
  });
});

describe("service catalog mutations", () => {
  it("creates a service and writes a SERVICE_CREATED audit log", async () => {
    const service = await createService(baseInput(), manager);

    expect(service.code).toBe(`TST-${sfx.toUpperCase()}-A`);
    expect(service.pricePaise).toBe(10_000);
    expect(service.active).toBe(true);

    const audit = await lastAudit(service.id);
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe("SERVICE_CREATED");
    expect(audit!.userId).toBe(manager.id);
    expect((audit!.after as { code: string }).code).toBe(service.code);
  });

  it("rejects a duplicate service code with 409", async () => {
    await expectApiError(
      createService(baseInput({ name: "Duplicate" }), manager),
      409,
      /already exists/,
    );
  });

  it("rejects mutations from roles without manage permission", async () => {
    expect(authorize(viewer, SERVICE_MANAGE_ROLES).ok).toBe(false);
    await expectApiError(
      createService(baseInput({ code: `TST-${sfx}-f1` }), viewer),
      403,
      /permission/,
    );
    await expectApiError(
      createService(baseInput({ code: `TST-${sfx}-f2` }), outsider),
      403,
      /permission/,
    );
  });

  it("updates a service and writes a SERVICE_UPDATED audit log", async () => {
    const service = await createService(
      baseInput({ code: `TST-${sfx}-u` }),
      manager,
    );

    const updated = await updateService(
      service.id,
      { name: "Updated Test Service", pricePaise: 25_000 },
      manager,
    );
    expect(updated.name).toBe("Updated Test Service");
    expect(updated.pricePaise).toBe(25_000);

    const audit = await lastAudit(service.id);
    expect(audit!.action).toBe("SERVICE_UPDATED");
    expect((audit!.before as { name: string }).name).toBe("Test Service");
    expect((audit!.after as { pricePaise: number }).pricePaise).toBe(25_000);
  });

  it("deactivates and reactivates with the dedicated audit actions", async () => {
    const service = await createService(
      baseInput({ code: `TST-${sfx}-t` }),
      manager,
    );

    const off = await updateService(service.id, { active: false }, manager);
    expect(off.active).toBe(false);
    let audit = await lastAudit(service.id);
    expect(audit!.action).toBe("SERVICE_DEACTIVATED");

    const on = await updateService(service.id, { active: true }, manager);
    expect(on.active).toBe(true);
    audit = await lastAudit(service.id);
    expect(audit!.action).toBe("SERVICE_ACTIVATED");
  });

  it("rejects an unknown service with 404 and a conflicting code with 409", async () => {
    const first = await createService(
      baseInput({ code: `TST-${sfx}ca` }),
      manager,
    );
    await createService(baseInput({ code: `TST-${sfx}cb` }), manager);

    await expectApiError(
      updateService(`missing-${stamp}`, { name: "Ghost" }, manager),
      404,
      /not found/i,
    );
    await expectApiError(
      updateService(
        first.id,
        { code: `TST-${sfx}cb` },
        manager,
      ),
      409,
      /already exists/,
    );
  });

  it("rejects updates from roles without manage permission", async () => {
    const service = await createService(
      baseInput({ code: `TST-${sfx}-g` }),
      manager,
    );
    await expectApiError(
      updateService(service.id, { pricePaise: 1 }, viewer),
      403,
      /permission/,
    );
  });
});

describe("service catalog list", () => {
  it("searches by code and filters by department and active flag", async () => {
    const active = await createService(
      baseInput({ code: `TST-${sfx}-on`, department: "LAB" }),
      manager,
    );
    const inactive = await createService(
      baseInput({ code: `TST-${sfx}-off`, department: "LAB" }),
      manager,
    );
    await updateService(inactive.id, { active: false }, manager);

    const bySearch = await listServices({
      page: 1,
      pageSize: 50,
      q: `TST-${sfx}-o`,
      department: undefined,
      category: undefined,
      active: undefined,
    });
    const codes = bySearch.items.map((s) => s.code);
    expect(codes).toContain(active.code);
    expect(codes).toContain(inactive.code);

    const onlyInactive = await listServices({
      page: 1,
      pageSize: 50,
      q: `TST-${sfx}-o`,
      department: undefined,
      category: undefined,
      active: false,
    });
    expect(onlyInactive.items.map((s) => s.code)).toEqual([inactive.code]);

    const byDepartment = await listServices({
      page: 1,
      pageSize: 50,
      q: `TST-${sfx}-o`,
      department: "OP",
      category: undefined,
      active: undefined,
    });
    expect(byDepartment.items).toHaveLength(0);
  });
});
