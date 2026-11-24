import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { ApiError, handleApiError } from "@/modules/shared/api";
import { saveSignatureImage } from "@/modules/settings/service";

/** POST /api/settings/upload-signature — Admin only: authorised signature image. */
export async function POST(req: Request) {
  try {
    const actor = await requireApiPermission("settings.manage");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Attach an image in the 'file' field");
    }
    const url = await saveSignatureImage(file, actor);
    return NextResponse.json({ url });
  } catch (error) {
    return handleApiError(error);
  }
}
