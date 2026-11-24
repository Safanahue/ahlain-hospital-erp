import { NextResponse } from "next/server";
import { getSessionUser } from "@/modules/auth/guards";
import { ApiError, handleApiError, parseBody } from "@/modules/shared/api";
import { changePasswordSchema } from "@/modules/settings/schemas";
import { changeOwnPassword } from "@/modules/settings/service";

/**
 * POST /api/account/change-password — the signed-in user replaces their own
 * password (used both for the forced change and voluntary changes).
 * Uses getSessionUser rather than requireApiUser so a forced-change account can
 * still reach exactly this endpoint.
 */
export async function POST(req: Request) {
  try {
    const actor = await getSessionUser();
    if (!actor) {
      throw new ApiError(401, "You must be signed in to change your password");
    }

    const input = await parseBody(changePasswordSchema, req);
    await changeOwnPassword(actor, input);

    return NextResponse.json({ ok: true, mustChangePassword: false });
  } catch (error) {
    return handleApiError(error);
  }
}
