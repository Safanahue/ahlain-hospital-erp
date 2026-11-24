import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePermissions, type PermissionKey } from "./permissions";

/**
 * Effective permissions = role template + the user's explicit overrides.
 * Read from the database on every check so permission edits take effect
 * immediately, without waiting for the user to sign in again.
 *
 * Deliberately free of NextAuth imports so services and tests can use it.
 */
export async function getPermissionsFor(
  user: Pick<User, "id" | "role">,
): Promise<Set<PermissionKey>> {
  const overrides = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true },
  });
  return resolvePermissions(user.role, overrides);
}
