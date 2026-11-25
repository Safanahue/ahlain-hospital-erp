import "server-only";
import type { User } from "@prisma/client";
import { ApiError } from "@/modules/shared/api";
import { authorize } from "./authorize";
import type { PermissionKey } from "./permissions";
import { getPermissionsFor } from "./permissions-service";

/**
 * Service-layer guard for module permissions.
 *
 * Pages and API routes already resolve access through the permission catalogue
 * (role defaults + per-user overrides). Service functions must use the same
 * source of truth, otherwise an administrator can grant — or revoke — a
 * permission and have the UI and API disagree with the module service.
 */
export async function requireModulePermission(
  actor: User,
  permission: PermissionKey,
): Promise<void> {
  const result = authorize({ role: actor.role, active: actor.active });
  if (!result.ok) throw new ApiError(result.status, result.message);

  const permissions = await getPermissionsFor(actor);
  if (!permissions.has(permission)) {
    throw new ApiError(
      403,
      "You do not have permission to use this module",
      { code: "PERMISSION_DENIED", permission },
    );
  }
}
