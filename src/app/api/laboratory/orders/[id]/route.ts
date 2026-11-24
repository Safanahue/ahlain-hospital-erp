import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateLabOrderSchema } from "@/modules/laboratory/schemas";
import { getLabOrder, updateLabOrder } from "@/modules/laboratory/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("lab.access");
    const { id } = await params;
    const order = await getLabOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Lab order not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("lab.results");
    const { id } = await params;
    const input = await parseBody(updateLabOrderSchema, req);
    const order = await updateLabOrder(id, input, actor);
    return NextResponse.json({ order });
  } catch (error) {
    return handleApiError(error);
  }
}
