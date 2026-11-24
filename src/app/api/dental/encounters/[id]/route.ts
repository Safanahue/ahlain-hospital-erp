import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateDentalEncounterSchema } from "@/modules/dental/schemas";
import { getDentalEncounter, updateDentalEncounter } from "@/modules/dental/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("dental.access");
    const { id } = await params;
    const encounter = await getDentalEncounter(id);
    if (!encounter) {
      return NextResponse.json({ error: "Dental encounter not found" }, { status: 404 });
    }
    return NextResponse.json({ encounter });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("dental.access");
    const { id } = await params;
    const input = await parseBody(updateDentalEncounterSchema, req);
    const encounter = await updateDentalEncounter(id, input, actor);
    return NextResponse.json({ encounter });
  } catch (error) {
    return handleApiError(error);
  }
}
