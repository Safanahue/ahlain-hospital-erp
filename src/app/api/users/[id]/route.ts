import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateUserSchema } from "@/modules/settings/schemas";
import { updateUser } from "@/modules/settings/service";

/** PATCH /api/users/:id — Admin only: profile, role, activation. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("users.manage");
    const { id } = await params;
    const input = await parseBody(updateUserSchema, req);
    const user = await updateUser(id, input, actor);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
