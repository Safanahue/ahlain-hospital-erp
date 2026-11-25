import { z } from "zod";
import { Gender } from "@prisma/client";

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

/** Normalises "…spaces/dashes…+91…" input to a bare 10-digit number. */
function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, "").replace(/^\+91/, "");
}

const phoneRequired = z
  .string({ message: "Phone number is required" })
  .trim()
  .min(1, "Phone number is required")
  .transform(normalizePhone)
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number");

const phoneOptional = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number");

/** "YYYY-MM-DD" calendar date (age is derived from it server-side). */
const dobString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

const bloodGroup = z
  .union([z.literal(""), z.enum(BLOOD_GROUPS), z.null()])
  .transform((v): (typeof BLOOD_GROUPS)[number] | null =>
    v === "" || v === null ? null : v,
  )
  // .optional() must wrap the transform so an ABSENT key parses to undefined
  // (keeps the "at least one change" refine honest on partial updates).
  .optional();

const ageField = z
  .number({ message: "Age is required" })
  .int("Age must be a whole number")
  .min(0, "Age cannot be negative")
  .max(120, "Age cannot exceed 120")
  .optional();

/**
 * Whole years between dob and today, computed in UTC because `@db.Date`
 * values are stored as UTC midnight (negative = future date).
 */
export function ageFromDob(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Age to show in the UI. Prefer the date of birth (derived) and never display
 * the legacy default of 30 for patients imported without a date of birth.
 */
export function displayAge(patient: { age: number; dob: Date | null }): number | null {
  if (patient.dob) return ageFromDob(patient.dob);
  if (patient.age === 30) return null;
  return patient.age;
}

function parseDob(dob: string): Date {
  // UTC midnight keeps the calendar date exact in every timezone.
  return new Date(`${dob}T00:00:00Z`);
}

function checkDob(
  dob: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["dob"],
) {
  if (!dob) return;
  const parsed = parseDob(dob);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Enter a valid date of birth",
    });
    return;
  }
  const derived = ageFromDob(parsed);
  if (derived < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Date of birth cannot be in the future",
    });
  } else if (derived > 120) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Date of birth is too far in the past",
    });
  }
}

/**
 * GET /api/patients — server-side pagination, search (name / UHID / phone)
 * and an optional gender filter.
 */
export const patientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  gender: z.nativeEnum(Gender).optional(),
});
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

/** POST /api/patients — age is required unless a date of birth is supplied.
 * dob accepts "" as “not provided”. */
export const createPatientSchema = z
  .object({
    name: z.string().trim().min(1, "Patient name is required").max(120),
    phone: phoneRequired,
    age: ageField,
    dob: z.union([dobString, z.literal("")]).optional(),
    gender: z.nativeEnum(Gender, { message: "Select a gender" }),
    bloodGroup,
    address: z.string().trim().max(300, "Address is too long").optional().default(""),
    emergencyContactName: z
      .string()
      .trim()
      .max(120, "Name is too long")
      .optional()
      .default(""),
    emergencyContactPhone: phoneOptional.optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.dob) checkDob(value.dob, ctx);
    if (!value.dob && value.age === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["age"],
        message: "Enter the patient's age or date of birth",
      });
    }
  });
export type CreatePatientInput = z.input<typeof createPatientSchema>;

/**
 * PATCH /api/patients/:id — partial update.
 * dob semantics: absent = unchanged · "" = clear · "YYYY-MM-DD" = set.
 * When dob is present the age is always recomputed from it.
 */
export const updatePatientSchema = z
  .object({
    name: z.string().trim().min(1, "Patient name is required").max(120).optional(),
    phone: phoneRequired.optional(),
    age: ageField,
    dob: z.union([dobString, z.literal("")]).optional(),
    gender: z.nativeEnum(Gender, { message: "Select a gender" }).optional(),
    bloodGroup,
    address: z.string().trim().max(300, "Address is too long").optional(),
    emergencyContactName: z.string().trim().max(120, "Name is too long").optional(),
    emergencyContactPhone: phoneOptional.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  })
  .superRefine((value, ctx) => {
    if (value.dob && value.dob !== "") checkDob(value.dob, ctx);
  });
export type UpdatePatientInput = z.input<typeof updatePatientSchema>;
