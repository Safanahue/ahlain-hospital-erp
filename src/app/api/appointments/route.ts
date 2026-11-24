import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createAppointmentSchema, appointmentListQuerySchema } from "@/modules/appointments/schemas";
import { createAppointment, listAppointments } from "@/modules/appointments/service";

/** GET /api/appointments — paginated, searchable appointment list. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("appointments.access");
    const query = parseQuery(appointmentListQuerySchema, req);
    const result = await listAppointments(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/appointments — book one appointment (Reception/Admin/Doctor). */
export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("appointments.access");
    const input = await parseBody(createAppointmentSchema, req);
    const result = await createAppointment(input, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
