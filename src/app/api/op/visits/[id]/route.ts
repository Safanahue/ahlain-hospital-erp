import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateOpVisitSchema } from "@/modules/appointments/schemas";
import { getOpVisit, updateOpVisit } from "@/modules/op/service";

/** GET /api/op/visits/:id — one OP visit. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("op.access");
    const { id } = await params;
    const visit = await getOpVisit(id);
    if (!visit) {
      return NextResponse.json({ error: "OP visit not found" }, { status: 404 });
    }
    return NextResponse.json({ visit });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/op/visits/:id — progress the clinical workflow. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("op.access");
    const { id } = await params;
    const input = await parseBody(updateOpVisitSchema, req);
    const visit = await updateOpVisit(id, input, actor);
    return NextResponse.json({ visit });
  } catch (error) {
    return handleApiError(error);
  }
}
