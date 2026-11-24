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
