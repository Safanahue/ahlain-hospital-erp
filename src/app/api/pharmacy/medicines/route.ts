import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createMedicineSchema } from "@/modules/pharmacy/schemas";
import { createMedicine, listMedicines } from "@/modules/pharmacy/service";

export async function GET(req: Request) {
  try {
    await requireApiPermission("pharmacy.access");
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;

    const medicines = await listMedicines({ search, category });
    return NextResponse.json({ items: medicines, total: medicines.length });
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
