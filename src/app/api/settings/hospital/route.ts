import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateHospitalSettingsSchema } from "@/modules/settings/schemas";
import { updateHospitalSettings } from "@/modules/settings/service";

/** PUT /api/settings/hospital — Admin only. */
export async function PUT(req: Request) {
  try {
    const actor = await requireApiPermission("settings.manage");
    const input = await parseBody(updateHospitalSettingsSchema, req);
    const settings = await updateHospitalSettings(input, actor);
    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
