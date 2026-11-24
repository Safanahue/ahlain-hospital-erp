import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const admissionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
  q: z.string().trim().optional(),
  status: z.enum(["ALL", "ADMITTED", "DISCHARGED"]).optional().default("ALL"),
  ward: z.string().trim().optional(),
});

export type AdmissionListQuery = z.infer<typeof admissionListQuerySchema>;

export const createAdmissionSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  admittingDoctorId: z.string().min(1, "Select the admitting doctor"),
  attendingDoctorId: z.string().optional().nullable(),
  bedId: z.string().min(1, "Select a bed"),
  diagnosis: z.string().trim().min(1, "Admission diagnosis is required").max(2000),
  admissionDate: z.string().trim().optional().nullable(),
});

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>;

export const updateAdmissionSchema = z.object({
  attendingDoctorId: z.string().optional().nullable(),
  diagnosis: z.string().trim().min(1).max(2000).optional(),
});

export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;

export const transferAdmissionSchema = z.object({
  toBedId: z.string().min(1, "Select the destination bed"),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export type TransferAdmissionInput = z.infer<typeof transferAdmissionSchema>;

export const progressNoteSchema = z.object({
  noteDate: z.string().trim().optional().nullable(),
  note: z.string().trim().min(1, "Write the progress note").max(5000),
  treatment: z.string().trim().max(5000).optional().nullable(),
});

export type ProgressNoteInput = z.infer<typeof progressNoteSchema>;

export const DISCHARGE_TYPES = [
  "CURED",
  "IMPROVED",
  "REFERRED",
  "LAMA",
  "TRANSFERRED_OUT",
  "DEATH",
] as const;

export const dischargeSchema = z.object({
  dischargeDate: z.string().trim().optional().nullable(),
  dischargeType: z.enum(DISCHARGE_TYPES).default("IMPROVED"),
  dischargeSummary: z.string().trim().min(1, "Discharge summary is required").max(20000),
  finalDiagnosis: z.string().trim().max(2000).optional().nullable(),
  conditionAtDischarge: z.string().trim().max(2000).optional().nullable(),
  createInvoice: z.boolean().optional().default(true),
  billItems: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Describe the charge").max(200),
        category: z
          .enum([
            "SERVICE_CHARGES",
            "LABORATORY",
            "PHARMACY",
            "ROOM_CHARGES",
            "DOCTOR_CONSULTATION",
            "OTHER_CHARGES",
          ])
          .default("OTHER_CHARGES"),
        amountRupees: z.coerce.number().min(0).max(10_000_000),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});

export type DischargeInput = z.input<typeof dischargeSchema>;

export const bedSchema = z.object({
  bedNumber: z.string().trim().min(1, "Bed number is required").max(40),
  ward: z.string().trim().min(1, "Ward is required").max(80),
  roomNo: z.string().trim().max(40).optional().nullable(),
  floor: z.string().trim().max(40).optional().nullable(),
  dailyRateRupees: z.coerce.number().min(0).max(1_000_000).default(0),
  status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]).optional().default("AVAILABLE"),
});

export type BedInput = z.input<typeof bedSchema>;

export const updateBedSchema = bedSchema.partial();

export type UpdateBedInput = z.input<typeof updateBedSchema>;

/** Accepts YYYY-MM-DD or a full ISO timestamp; rejects anything unparseable. */
export function parseDateInput(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const raw = ISO_DATE.test(value) ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return parsed;
}
