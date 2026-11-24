import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updatePatientSchema } from "@/modules/patients/schemas";
import { updatePatient } from "@/modules/patients/service";
import { getPatientDetail } from "@/modules/patients/queries";

/** GET /api/patients/:id — one patient (demographics + billing timeline). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("patients.view");
    const { id } = await params;
    const detail = await getPatientDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/patients/:id — update demographics (Reception, Admin). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("patients.manage");
    const { id } = await params;
    const input = await parseBody(updatePatientSchema, req);
    const patient = await updatePatient(id, input, actor);
    return NextResponse.json({ patient });
  } catch (error) {
    return handleApiError(error);
  }
}
