import { z } from "zod";
import { Department, Gender } from "@prisma/client";

/** "YYYY-MM-DD" calendar date; accepts "" as “not provided”. */
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

const dateOptional = dateString.or(z.literal(""));

/** Normalises "…" +91 …" and spaces/dashes to a bare 10-digit number. */
function normalizePhone(value: string): string {
  return value.replace(/[\\s-]/g, "").replace(/^\\+91/, "");
}

const phoneRequired = z
  .string({ message: "Phone number is required" })
  .trim()
  .min(1, "Phone number is required")
  .transform(normalizePhone)
  .refine((v) => /^[6-9]\\d{9}$/.test(v), "Enter a valid 10-digit mobile number");

const phoneOptional = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((v) => v === "" || /^[6-9]\\d{9}$/.test(v), "Enter a valid 10-digit mobile number");

/** Appointment datetime (= patient arrival). Accepts YYYY-MM-DD or ISO datetime strings. */
export const appointmentSlotSchema = z.string().trim().min(1, "Date is required").refine(
  (v) => Number.isFinite(new Date(v).getTime()),
  { message: "Enter a valid date and time" },
);

/** GET /api/appointments — list. */
export const appointmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  status: z
    .enum(["SCHEDULED", "CHECKED_IN", "DONE", "NO_SHOW", "ALL"])
    .optional()
    .transform((v) => (v === "ALL" ? undefined : v)),
  from: dateString.optional(),
  to: dateString.optional(),
});

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

/** POST /api/appointments — create one booking. */
export const createAppointmentSchema = z
  .object({
    patientId: z.string().min(1, "Select a patient"),
    doctorId: z.string().min(1, "Select a doctor"),
    slot: appointmentSlotSchema,
    notes: z
      .string()
      .trim()
      .max(300, "Notes are too long")
      .optional()
      .default(""),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/** PATCH /api/appointments/:id — check-in / complete / no-show. */
export const updateAppointmentSchema = z
  .object({
    status: z.enum(["CHECKED_IN", "DONE", "NO_SHOW"]),
    notes: z
      .string()
      .trim()
      .max(300, "Notes are too long")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  });

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

/** GET /api/appointments/slots?doctorId=&date= — the daily timetable. */
export const appointmentSlotsQuerySchema = z.object({
  doctorId: z.string().min(1, "Select a doctor"),
  date: dateString.or(z.literal("")).default("").optional(),
});

export type AppointmentSlotsQuery = z.infer<typeof appointmentSlotsQuerySchema>;

/** POST /api/op/visits — register one OP visit. */
export const createOpVisitSchema = z
  .object({
    patientId: z.string().min(1, "Select a patient"),
    doctorId: z.string().min(1, "Select a doctor"),
    nurseId: z.string().optional(),
    complaint: z
      .string()
      .trim()
      .max(500, "Description is too long")
      .optional()
      .default(""),
    provisionalDiagnosis: z
      .string()
      .trim()
      .max(500, "Description is too long")
      .optional()
      .default(""),
    treatmentPlan: z
      .string()
      .trim()
      .max(1000, "Description is too long")
      .optional()
      .default(""),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  });

export type CreateOpVisitInput = z.infer<typeof createOpVisitSchema>;

/** PATCH /api/op/visits/:id — progress the clinical workflow. */
export const updateOpVisitSchema = z
  .object({
    status: z.enum(["WAITING_ROOM", "COMPLETED", "CANCELLED"]),
    complaint: z
      .string()
      .trim()
      .max(500, "Description is too long")
      .optional(),
    provisionalDiagnosis: z
      .string()
      .trim()
      .max(500, "Description is too long")
      .optional(),
    treatmentPlan: z
      .string()
      .trim()
      .max(1000, "Description is too long")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were supplied",
  });

export type UpdateOpVisitInput = z.infer<typeof updateOpVisitSchema>;
