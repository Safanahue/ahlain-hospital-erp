import "server-only";
import type { ServiceCatalog, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { SERVICE_MANAGE_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import {
  createServiceSchema,
  updateServiceSchema,
  type CreateServiceInput,
  type UpdateServiceInput,
} from "./schemas";

/** Compact audit snapshot for a catalog row. */
function snapshot(service: ServiceCatalog) {
  return {
    code: service.code,
    name: service.name,
    description: service.description,
    department: service.department,
    category: service.category,
    pricePaise: service.pricePaise,
    active: service.active,
  };
}

/**
 * Defense in depth: the API routes already guard with SERVICE_MANAGE_ROLES,
 * but the service re-checks so every caller (and tests) get the same 403.
 */
function assertCanManage(actor: User) {
  const result = authorize(
    { role: actor.role, active: actor.active },
    SERVICE_MANAGE_ROLES,
  );
  if (!result.ok) throw new ApiError(result.status, result.message);
}

/** POST /api/services — creates one catalog row and audit-logs SERVICE_CREATED. */
export async function createService(
  rawInput: CreateServiceInput,
  actor: User,
): Promise<ServiceCatalog> {
  assertCanManage(actor);
  const input = createServiceSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.serviceCatalog.create({ data: input });
      await writeAuditLog(tx, {
        userId: actor.id,
        action: "SERVICE_CREATED",
        entity: "ServiceCatalog",
        entityId: service.id,
        before: null,
        after: snapshot(service),
      });
      return service;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        409,
        `Service code "${input.code}" already exists. Each service needs a unique code.`,
        { field: "code" },
      );
    }
    throw error;
  }
}

/**
 * PATCH /api/services/:id — partial update.
 * Audit action reflects what changed:
 *   active flag  → SERVICE_ACTIVATED / SERVICE_DEACTIVATED
 *   anything else → SERVICE_UPDATED
 */
export async function updateService(
  id: string,
  rawInput: UpdateServiceInput,
  actor: User,
): Promise<ServiceCatalog> {
  assertCanManage(actor);
  const input = updateServiceSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.serviceCatalog.findUnique({ where: { id } });
      if (!before) throw new ApiError(404, "Service not found");

      const after = await tx.serviceCatalog.update({ where: { id }, data: input });

      const action =
        input.active === undefined
          ? "SERVICE_UPDATED"
          : input.active
            ? "SERVICE_ACTIVATED"
            : "SERVICE_DEACTIVATED";

      await writeAuditLog(tx, {
        userId: actor.id,
        action,
        entity: "ServiceCatalog",
        entityId: after.id,
        before: snapshot(before),
        after: snapshot(after),
      });

      return after;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        409,
        `Service code "${input.code}" already exists. Each service needs a unique code.`,
        { field: "code" },
      );
    }
    throw error;
  }
}
