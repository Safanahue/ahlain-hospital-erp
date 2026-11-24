import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateRefRangeSchema } from "@/modules/laboratory/schemas";
import {
  getReferenceRange,
  updateReferenceRange,
  deleteReferenceRange,
} from "@/modules/laboratory/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("lab.access");
    const { id } = await params;
    const range = await getReferenceRange(id);
    if (!range) {
      return NextResponse.json({ error: "Reference range not found" }, { status: 404 });
    }
    return NextResponse.json({ range });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("lab.masters");
    const { id } = await params;
    const input = await parseBody(updateRefRangeSchema, req);
    const range = await updateReferenceRange(id, input, user);
    return NextResponse.json({ range });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("lab.masters");
    const { id } = await params;
    const result = await deleteReferenceRange(id, user);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
