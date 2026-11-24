import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { resetPasswordSchema } from "@/modules/settings/schemas";
import { resetStaffPassword } from "@/modules/settings/service";

/**
 * POST /api/users/:id/password-reset — Admin issues a new temporary password.
 * The password is returned once; the account is forced to change it at next
 * sign-in and the event is audit logged without the password.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiPermission("users.manage");
    const { id } = await params;
    const input = await parseBody(resetPasswordSchema, req);
    const { user, temporaryPassword, generated } = await resetStaffPassword(
      id,
      input,
      actor,
    );

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        mustChangePassword: user.mustChangePassword,
      },
      temporaryPassword,
      generated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
