import "server-only";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { authorize } from "./authorize";
import type { PermissionKey } from "./permissions";
import { getPermissionsFor } from "./permissions-service";

export { getPermissionsFor };

/**
 * Resolves the signed-in user from the session and re-reads them from the
 * database so role/active changes take effect immediately. Returns null when
 * the session is missing, the user was deleted, or the account is deactivated.
 */
export async function getSessionUser(): Promise<User | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return null;
  return user;
}

/** Server-side guard for pages: redirects to /login or /forbidden. */
export async function requirePageUser(roles?: Role[]): Promise<User> {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null;

  const result = authorize(user, roles);
  if (!result.ok) {
    if (result.status === 401) redirect("/login");
    redirect("/forbidden");
  }
  // Admin-issued temporary password: no module is usable until it is replaced.
  if ((user as User).mustChangePassword) redirect("/change-password");
  return user as User;
}

/** Server-side guard for API routes: throws ApiError 401/403. */
export async function requireApiUser(roles?: Role[]): Promise<User> {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null;

  const result = authorize(user, roles);
  if (!result.ok) {
    throw new ApiError(result.status, result.message);
  }
  // Enforce the forced password change on the backend too, so a stale session
  // cannot keep using APIs after an administrator reset the password.
  if ((user as User).mustChangePassword) {
    throw new ApiError(
      403,
      "Set a new password before continuing",
      { code: "PASSWORD_CHANGE_REQUIRED" },
    );
  }
  return user as User;
}

/** Page guard for one module permission: redirects instead of throwing. */
export async function requirePagePermission(
  permission: PermissionKey,
): Promise<User> {
  const user = await requirePageUser();
  const permissions = await getPermissionsFor(user);
  if (!permissions.has(permission)) redirect("/forbidden");
  return user;
}

/** API guard for one module permission: throws 401/403 as JSON. */
export async function requireApiPermission(
  permission: PermissionKey,
): Promise<User> {
  const user = await requireApiUser();
  const permissions = await getPermissionsFor(user);
  if (!permissions.has(permission)) {
    throw new ApiError(
      403,
      "You do not have permission to use this module",
      { code: "PERMISSION_DENIED", permission },
    );
  }
  return user;
}
