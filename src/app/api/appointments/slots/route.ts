import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseQuery } from "@/modules/shared/api";
import { appointmentSlotsQuerySchema } from "@/modules/appointments/schemas";
import { getAppointmentSlots } from "@/modules/appointments/service";

/** GET /api/appointments/slots?doctorId=&date= — a doctor's daily timetable. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("appointments.access");
    const query = parseQuery(appointmentSlotsQuerySchema, req);
    const slots = await getAppointmentSlots(query);
    return NextResponse.json({ slots });
  } catch (error) {
    return handleApiError(error);
  }
}
