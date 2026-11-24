import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateBedSchema } from "@/modules/ip/schemas";
import { deleteBed, updateBed } from "@/modules/ip/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.access");
    const { id } = await params;
    const input = await parseBody(updateBedSchema, req);
    const bed = await updateBed(id, input, user);
    return NextResponse.json({ bed });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.access");
    const { id } = await params;
    await deleteBed(id, user);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return handleApiError(error);
  }
}
