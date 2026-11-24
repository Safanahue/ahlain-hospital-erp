import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createLabOrderSchema } from "@/modules/laboratory/schemas";
import { createLabOrder, listLabOrders } from "@/modules/laboratory/service";

export async function GET() {
  try {
    await requireApiPermission("lab.access");
    const orders = await listLabOrders();
    return NextResponse.json({ items: orders, total: orders.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("lab.access");
    const input = await parseBody(createLabOrderSchema, req);
    const order = await createLabOrder(input, user);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
