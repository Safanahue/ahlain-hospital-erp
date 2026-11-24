import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createDentalEncounterSchema } from "@/modules/dental/schemas";
import { createDentalEncounter, listDentalEncounters } from "@/modules/dental/service";

export async function GET() {
  try {
    await requireApiPermission("dental.access");
    const encounters = await listDentalEncounters();
    return NextResponse.json({ items: encounters, total: encounters.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("dental.access");
    const input = await parseBody(createDentalEncounterSchema, req);
    const encounter = await createDentalEncounter(input, user);
    return NextResponse.json({ encounter }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
