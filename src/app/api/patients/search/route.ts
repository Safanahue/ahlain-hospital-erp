import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { searchPatients } from "@/modules/patients/queries";

/**
 * GET /api/patients/search?q=...&limit=10
 * Fast live search endpoint for patient autocomplete.
 * Searches case-insensitively across name, UHID, and phone number by tokens.
 */
export async function GET(req: Request) {
  try {
    await requireApiPermission("patients.view");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const limit = Number(searchParams.get("limit") ?? 10);

    const patients = await searchPatients(q, limit);
    return NextResponse.json({ patients });
  } catch (error) {
    return handleApiError(error);
  }
}
