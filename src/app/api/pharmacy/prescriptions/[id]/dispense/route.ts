import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { dispensePrescription } from "@/modules/pharmacy/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const { id } = await params;
    const prescription = await dispensePrescription(id, user);
    return NextResponse.json({ prescription });
  } catch (error) {
    return handleApiError(error);
  }
}
