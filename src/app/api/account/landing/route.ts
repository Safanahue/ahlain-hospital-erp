import { NextResponse } from "next/server";
import { requireApiUser } from "@/modules/auth/guards";
import { landingPathForRole } from "@/modules/auth/landing";
import { handleApiError } from "@/modules/shared/api";

/** GET /api/account/landing — role-aware start page after sign-in. */
export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ path: landingPathForRole(user.role) });
  } catch (error) {
    return handleApiError(error);
  }
}
