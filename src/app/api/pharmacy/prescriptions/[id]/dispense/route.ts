import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { dispensePrescription } from "@/modules/pharmacy/service";

/** POST /api/pharmacy/prescriptions/:id/dispense — deduct stock + bill the patient. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const { id } = await params;
    const result = await dispensePrescription(id, user);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
