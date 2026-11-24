import type { Role } from "@prisma/client";

export type AuthSubject = { role: Role; active: boolean };

export type AuthResult =
  | { ok: true; subject: AuthSubject }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Single source of truth for role checks (server-side, never UI-only).
 * - no subject            → 401
 * - deactivated subject   → 401
 * - role not permitted    → 403
 */
export function authorize(
  subject: AuthSubject | null | undefined,
  roles?: Role[],
): AuthResult {
  if (!subject) {
    return {
      ok: false,
      status: 401,
      message: "You must be signed in to perform this action",
    };
  }
  if (!subject.active) {
    return { ok: false, status: 401, message: "Your session is no longer valid" };
  }
  if (roles && !roles.includes(subject.role)) {
    return {
      ok: false,
      status: 403,
      message: "You do not have permission to perform this action",
    };
  }
  return { ok: true, subject };
}
