import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { stockMovementSchema } from "@/modules/pharmacy/schemas";
import { getMedicine, recordStockMovement } from "@/modules/pharmacy/service";
import { listStockMovements } from "@/modules/pharmacy/queries";

/** GET /api/pharmacy/medicines/:id/stock — medicine + its stock ledger. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("pharmacy.access");
    const { id } = await params;
    const medicine = await getMedicine(id);
    const movements = await listStockMovements(id);
    return NextResponse.json({ medicine, movements });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/pharmacy/medicines/:id/stock — record a stock movement. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("pharmacy.access");
    const { id } = await params;
    const input = await parseBody(stockMovementSchema, req);
    const result = await recordStockMovement(id, input, user);
    const movements = await listStockMovements(id);
    return NextResponse.json({ ...result, movements }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
