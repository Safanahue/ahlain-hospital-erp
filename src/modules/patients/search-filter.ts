import type { Prisma } from "@prisma/client";

/** Trims and collapses whitespace in a patient search term. */
export function normalizePatientQuery(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * One token matches anywhere in the full name (first, middle or last name),
 * the UHID or the phone number. Case-insensitive.
 */
function tokenFilter(token: string): Prisma.PatientWhereInput {
  return {
    OR: [
      { name: { contains: token, mode: "insensitive" } },
      { uhid: { contains: token, mode: "insensitive" } },
      { phone: { contains: token } },
    ],
  };
}

/**
 * Partial, case-insensitive patient search across every registered patient.
 * Every whitespace-separated token must match somewhere, so "sharma ravi" and
 * "ravi sharma" both find "Ravi Kumar Sharma" — no need for the full name.
 */
export function buildPatientSearchFilter(
  value?: string | null,
): Prisma.PatientWhereInput {
  const term = normalizePatientQuery(value);
  if (!term) return {};

  const tokens = term.split(" ");
  return tokens.length === 1
    ? tokenFilter(tokens[0])
    : { AND: tokens.map(tokenFilter) };
}
