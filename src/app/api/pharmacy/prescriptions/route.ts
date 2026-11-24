import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createPrescriptionSchema } from "@/modules/pharmacy/schemas";
import { createPrescription, listPrescriptions } from "@/modules/pharmacy/service";

export async function GET(req: Request) {
  try {
    await requireApiPermission("pharmacy.access");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const patientId = searchParams.get("patientId") || undefined;

    const prescriptions = await listPrescriptions({ status, patientId });
    return NextResponse.json({ items: prescriptions, total: prescriptions.length });
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
