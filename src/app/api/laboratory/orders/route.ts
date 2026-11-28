import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createLabOrderSchema, labOrderListQuerySchema } from "@/modules/laboratory/schemas";
import { createLabOrder, listLabOrders } from "@/modules/laboratory/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireApiPermission("lab.access");
    const query = parseQuery(labOrderListQuerySchema, req);
    const result = await listLabOrders(query);
    return NextResponse.json(result);
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
