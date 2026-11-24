import { z } from "zod";
import { Role } from "@prisma/client";
import { isPermissionKey } from "@/modules/auth/permissions";

export const updateHospitalSettingsSchema = z.object({
  hospitalName: z.string().trim().min(1, "Hospital name is required").max(120),
  address: z.string().trim().max(300).optional().default(""),
  upiId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID"),
  upiQrImageUrl: z.string().trim().max(300).optional(),
  /** Blank = the built-in computer-generated receipt footer. */
  receiptFooter: z.string().trim().max(300).optional().default(""),
  /** Blank = no terms block on the printed invoice. */
  termsText: z.string().trim().max(500).optional().default(""),
  /** Optional: keep the current logo unless a new upload replaces it. */
  logoImageUrl: z.string().trim().max(300).optional(),
  tagline: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40, "Phone number is too long").optional(),
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
    .optional(),
  website: z.string().trim().max(200).optional(),
  gstin: z.string().trim().max(20, "GSTIN is too long").optional(),
  /** Optional: keep the current signature unless a new upload replaces it. */
  signatureImageUrl: z.string().trim().max(300).optional(),
});
export type UpdateHospitalSettingsInput = z.infer<
  typeof updateHospitalSettingsSchema
>;

/**
 * Password policy for every password this app stores (temporary or chosen):
 * at least 8 characters, at most 72 (bcrypt limit), with a letter and a digit.
 * Existing hashes are unaffected — the policy applies when a password is set.
 */
export const passwordSchema = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password cannot exceed 72 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

const emailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(160);

const optionalTempPassword = z
  .union([passwordSchema, z.literal("")])
  .optional()
  .transform((value) => (value ? value : undefined));

/** POST /api/users — create a staff account with a temporary password. */
export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name").max(120),
  email: emailSchema,
  role: z.nativeEnum(Role, { message: "Select a role" }),
  /** Omit/empty = generate a secure temporary password on the server. */
  temporaryPassword: optionalTempPassword,
});
export type CreateStaffInput = z.input<typeof createStaffSchema>;

/**
 * PATCH /api/users/:id — edit profile, role or activation.
 * Passwords are never edited here; use the password-reset endpoint.
 */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the staff member's name").max(120).optional(),
    email: emailSchema.optional(),
    active: z.boolean().optional(),
    role: z.nativeEnum(Role).optional(),
  })
  .refine(
    (value) =>
      value.active !== undefined ||
      value.role !== undefined ||
      value.name !== undefined ||
      value.email !== undefined,
    { message: "No changes were supplied" },
  );
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** POST /api/users/:id/password-reset — issue a new temporary password. */
export const resetPasswordSchema = z.object({
  /** Omit/empty = generate a secure temporary password on the server. */
  newPassword: optionalTempPassword,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

/** POST /api/account/change-password — signed-in user changes their password. */
/** PUT /api/users/:id/permissions — full desired permission set for one user. */
export const updatePermissionsSchema = z.object({
  permissions: z
    .array(z.string())
    .max(64, "Too many permissions")
    .refine(
      (keys) => keys.every((key) => isPermissionKey(key)),
      "One or more permissions are not recognised",
    ),
});
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Re-enter the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
