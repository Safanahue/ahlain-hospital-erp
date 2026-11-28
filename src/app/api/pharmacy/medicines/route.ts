import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import {
  createMedicineSchema,
  medicineListQuerySchema,
} from "@/modules/pharmacy/schemas";
import { createMedicine } from "@/modules/pharmacy/service";
import { listMedicinesPaged, searchMedicinesForPicker } from "@/modules/pharmacy/queries";

/**
 * GET /api/pharmacy/medicines
 *   Default: paginated, searchable inventory (?page, ?pageSize, ?q, ?category, ?stock).
 *   ?view=picker: small search result set for the prescription medicine picker.
 */
export async function GET(req: Request) {
  try {
    await requireApiPermission("pharmacy.access");
    const { searchParams } = new URL(req.url);

    if (searchParams.get("view") === "picker") {
      const search = (searchParams.get("q") || "").trim();
      const items = await searchMedicinesForPicker(search);
      return NextResponse.json({ items });
    }

    const query = parseQuery(medicineListQuerySchema, req);
    const result = await listMedicinesPaged(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const input = await parseBody(createMedicineSchema, req);
    const medicine = await createMedicine(input, user);
    return NextResponse.json({ medicine }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
