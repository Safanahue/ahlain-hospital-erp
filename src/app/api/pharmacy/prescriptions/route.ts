import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import {
  createPrescriptionSchema,
  prescriptionListQuerySchema,
} from "@/modules/pharmacy/schemas";
import { createPrescription } from "@/modules/pharmacy/service";
import { listPrescriptionsPaged } from "@/modules/pharmacy/queries";

/** GET /api/pharmacy/prescriptions — paginated dispensing queue. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("pharmacy.access");
    const query = parseQuery(prescriptionListQuerySchema, req);
    const result = await listPrescriptionsPaged(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const input = await parseBody(createPrescriptionSchema, req);
    const prescription = await createPrescription(input, user);
    return NextResponse.json({ prescription }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
