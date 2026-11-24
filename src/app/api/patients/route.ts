import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createPatientSchema, patientListQuerySchema } from "@/modules/patients/schemas";
import { createPatient } from "@/modules/patients/service";
import { listPatients } from "@/modules/patients/queries";

/** GET /api/patients — paginated, searchable patient directory. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("patients.view");
    const query = parseQuery(patientListQuerySchema, req);
    const result = await listPatients(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/patients — register a patient (Reception, Admin). */
export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("patients.manage");
    const input = await parseBody(createPatientSchema, req);
    const patient = await createPatient(input, user);
    return NextResponse.json({ patient }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
