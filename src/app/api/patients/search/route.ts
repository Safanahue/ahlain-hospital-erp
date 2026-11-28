import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { searchPatients } from "@/modules/patients/queries";

/**
 * GET /api/patients/search?q=...&limit=10
 * Fast live search endpoint for patient autocomplete.
 * Searches case-insensitively across name (first/middle/last), UHID and phone
 * number by tokens, over every registered patient.
 */
export async function GET(req: Request) {
  try {
    await requireApiPermission("patients.view");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;

    const patients = await searchPatients(q, limit);
    return NextResponse.json(
      { patients, query: q.trim() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
