import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { ApiError, handleApiError } from "@/modules/shared/api";
import { saveBrandLogo } from "@/modules/settings/service";

/** POST /api/settings/upload-logo — Admin only: replace the hospital logo. */
export async function POST(req: Request) {
  try {
    const actor = await requireApiPermission("settings.manage");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Attach an image in the 'file' field");
    }
    const url = await saveBrandLogo(file, actor);
    return NextResponse.json({ url });
  } catch (error) {
    return handleApiError(error);
  }
}
