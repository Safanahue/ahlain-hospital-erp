import type { Role } from "@prisma/client";

/**
 * Where each role lands straight after sign-in. Every destination is a module
 * the role's default permission template can open; permission overrides are
 * still enforced by the page guards, so a denied module shows /forbidden
 * rather than silently sending the user somewhere unrelated.
 */
const ROLE_LANDING: Record<Role, string> = {
  ADMIN: "/",
  BILLING_STAFF: "/billing/invoices",
  ACCOUNTS: "/billing/invoices",
  DOCTOR: "/op",
  RECEPTION: "/appointments",
  NURSE: "/ip",
  LAB_TECHNICIAN: "/laboratory",
  PHARMACIST: "/pharmacy",
};

export function landingPathForRole(role: Role): string {
  return ROLE_LANDING[role] ?? "/";
}

/** Only same-origin absolute paths are accepted as post-login redirects. */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
