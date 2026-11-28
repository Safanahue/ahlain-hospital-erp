import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { cancelPrescriptionSchema } from "@/modules/pharmacy/schemas";
import { cancelPrescription } from "@/modules/pharmacy/service";

/** POST /api/pharmacy/prescriptions/:id/cancel — cancel / return with stock reversal. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const { id } = await params;
    const input = await parseBody(cancelPrescriptionSchema, req);
    const result = await cancelPrescription(id, input, user);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
