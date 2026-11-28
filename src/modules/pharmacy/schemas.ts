import { z } from "zod";

export const medicineCategories = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Ointment",
  "Drops",
  "Inhaler",
  "Other",
] as const;

/** Stock level below which a medicine is flagged as low stock. */
export const LOW_STOCK_THRESHOLD = 50;
/** Items expiring inside this window are flagged as near-expiry. */
export const NEAR_EXPIRY_DAYS = 90;

export const createMedicineSchema = z.object({
  itemCode: z.string().trim().min(2, "Item code required (e.g. MED-PARA-500)"),
  name: z.string().trim().min(2, "Medicine name is required"),
  category: z.string().trim().min(1, "Category is required"),
  manufacturer: z.string().trim().optional(),
  batchNumber: z.string().trim().min(1, "Batch number required"),
  expiryDate: z.string().min(1, "Expiry date required"), // YYYY-MM-DD
  stockQuantity: z.coerce.number().int().min(0).default(0),
  unitPriceRupees: z.coerce.number().min(0, "Unit price must be >= 0"),
});

export type CreateMedicineInput = z.infer<typeof createMedicineSchema>;

/** GET /api/pharmacy/medicines — server-side pagination, search and stock filters. */
export const medicineListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v !== "ALL" ? v : undefined)),
  /** all | low | out | expiring | expired */
  stock: z.enum(["all", "low", "out", "expiring", "expired"]).default("all"),
  /** include deactivated medicines (historical records) */
  includeInactive: z
    .union([z.literal("1"), z.literal("0")])
    .optional()
    .transform((v) => v === "1"),
});
export type MedicineListQuery = z.infer<typeof medicineListQuerySchema>;

/**
 * Stock movement. `quantity` is always positive; the direction comes from the
 * kind so a movement can never be applied backwards by mistake.
 */
export const stockMovementSchema = z.object({
  kind: z.enum(["RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT"]),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than zero"),
  reason: z.string().trim().min(3, "Enter a reason (3+ characters)").max(200),
  batchNumber: z.string().trim().max(60).optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  unitPriceRupees: z.coerce.number().min(0).optional(),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export const prescriptionItemSchema = z.object({
  medicineId: z.string().min(1, "Select medicine"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  dosage: z.string().trim().optional(), // e.g. "1-0-1 after food"
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  prescribedBy: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  items: z.array(prescriptionItemSchema).min(1, "Add at least one medicine"),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

/** GET /api/pharmacy/prescriptions — paginated, searchable dispensing queue. */
export const prescriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: z.enum(["ALL", "PENDING", "DISPENSED", "CANCELLED"]).default("ALL"),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;

export const cancelPrescriptionSchema = z.object({
  reason: z.string().trim().min(3, "Enter a reason").max(200),
});
export type CancelPrescriptionInput = z.infer<typeof cancelPrescriptionSchema>;
