import { z } from "zod";
import { Department, ItemCategory } from "@prisma/client";

/** Service code: 2–20 chars, uppercase letters / digits / hyphens (e.g. OP-CONSULT). */
const serviceCode = z
  .string()
  .trim()
  .min(2, "Code is too short")
  .max(20, "Code is too long")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]*$/,
    "Use letters, numbers and hyphens only",
  )
  .transform((value) => value.toUpperCase());

const serviceName = z
  .string()
  .trim()
  .min(1, "Service name is required")
  .max(120, "Service name is too long");

const serviceDescription = z
  .string()
  .trim()
  .max(300, "Description is too long")
  .optional()
  .default("");

/** Prices are integers in PAISE; ₹0 is allowed (free/covered services). */
const pricePaise = z
  .number({ message: "Price is required" })
  .int("Price must be a whole number")
  .min(0, "Price cannot be negative");

/**
 * GET /api/services — server-side pagination, search and filters.
 * Department / category / active are single-select filters validated against
 * the Prisma enums (invalid values → 400).
 */
export const serviceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  department: z.nativeEnum(Department).optional(),
  category: z.nativeEnum(ItemCategory).optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;

/** POST /api/services — duplicate codes are rejected in the service layer (409). */
export const createServiceSchema = z.object({
  code: serviceCode,
  name: serviceName,
  description: serviceDescription,
  department: z.nativeEnum(Department, {
    message: "Select a valid department",
  }),
  category: z.nativeEnum(ItemCategory, {
    message: "Select a valid category",
  }),
  pricePaise,
  active: z.boolean().default(true),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

/** PATCH /api/services/:id — partial update; at least one field required. */
export const updateServiceSchema = z
  .object({
    code: serviceCode.optional(),
    name: serviceName.optional(),
    description: z.string().trim().max(300, "Description is too long").optional(),
    department: z.nativeEnum(Department, {
      message: "Select a valid department",
    }).optional(),
    category: z.nativeEnum(ItemCategory, {
      message: "Select a valid category",
    }).optional(),
    pricePaise: pricePaise.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
