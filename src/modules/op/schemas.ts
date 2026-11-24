import { z } from "zod";
import { ApiError } from "@/modules/shared/api";

/** Input schema for creating an OP visit. */
export const createOpVisitSchema = z.object({
  patientId: z.string(),
  doctorId: z.string(),
  nurseId: z.string().optional(),
  complaint: z.string().optional(),
  provisionalDiagnosis: z.string().optional(),
  treatmentPlan: z.string().optional(),
});

/** Input schema for updating an OP visit. */
export const updateOpVisitSchema = z.object({
  status: z.enum(["WAITING_ROOM", "COMPLETED", "CANCELLED"]),
  complaint: z.string().optional(),
  provisionalDiagnosis: z.string().optional(),
  treatmentPlan: z.string().optional(),
});

/** Inferred types from the above schemas. */
export type CreateOpVisitInput = z.infer<typeof createOpVisitSchema>;
export type UpdateOpVisitInput = z.infer<typeof updateOpVisitSchema>;

/** GET /api/op/visits — today's visits (date from the server, not client-supplied). */
export async function opVisitsQuerySchema(
  req: Request,
): Promise<{ date: Date }> {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10)) as string;
  const parsed = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.flatten().fieldErrors);
  }
  return { date: new Date(`${parsed.data}T00:00:00Z`) };
}
