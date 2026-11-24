import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updatePermissionsSchema } from "@/modules/settings/schemas";
import { setUserPermissions } from "@/modules/settings/service";

/**
 * PUT /api/users/:id/permissions — Admin only: replace one account's
 * permission overrides with the supplied effective set.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("users.manage");
    const { id } = await params;
    const input = await parseBody(updatePermissionsSchema, req);
    const permissions = await setUserPermissions(id, input, actor);
    return NextResponse.json({ permissions });
  } catch (error) {
    return handleApiError(error);
  }
}
