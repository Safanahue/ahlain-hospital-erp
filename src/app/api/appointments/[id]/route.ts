import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateAppointmentSchema } from "@/modules/appointments/schemas";
import { getAppointment, updateAppointment } from "@/modules/appointments/service";

/** GET /api/appointments/:id — one appointment (any appointment role). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("appointments.access");
    const { id } = await params;
    const appointment = await getAppointment(id);
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    return NextResponse.json({ appointment });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/appointments/:id — check-in / complete / no-show. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("appointments.access");
    const { id } = await params;
    const input = await parseBody(updateAppointmentSchema, req);
    const result = await updateAppointment(id, input, actor);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
