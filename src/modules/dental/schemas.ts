import { z } from "zod";

export const createDentalEncounterSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  dentistId: z.string().min(1, "Select a dentist"),
  procedureName: z.string().trim().min(1, "Procedure name is required"),
  toothNumber: z.string().trim().optional(),
  chiefComplaint: z.string().trim().optional(),
  clinicalNotes: z.string().trim().optional(),
  costRupees: z.coerce.number().int().min(0).default(0),
});

export type CreateDentalEncounterInput = z.infer<typeof createDentalEncounterSchema>;

export const updateDentalEncounterSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  clinicalNotes: z.string().trim().optional(),
  toothNumber: z.string().trim().optional(),
  costRupees: z.coerce.number().int().min(0).optional(),
});

export type UpdateDentalEncounterInput = z.infer<typeof updateDentalEncounterSchema>;
