import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateServiceSchema } from "@/modules/catalog/schemas";
import { updateService } from "@/modules/catalog/service";
import { getService } from "@/modules/catalog/queries";

/** GET /api/services/:id — a single catalog entry. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiPermission("services.view");
    const { id } = await params;
    const service = await getService(id);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    return NextResponse.json({ service });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/services/:id — update fields and/or activate/deactivate
 * (Admin, Billing Staff). Every change is audit logged.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("services.manage");
    const { id } = await params;
    const input = await parseBody(updateServiceSchema, req);
    const service = await updateService(id, input, actor);
    return NextResponse.json({ service });
  } catch (error) {
    return handleApiError(error);
  }
}
