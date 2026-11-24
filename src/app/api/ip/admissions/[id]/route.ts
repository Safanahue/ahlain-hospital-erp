import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateAdmissionSchema } from "@/modules/ip/schemas";
import { getAdmission, updateAdmission } from "@/modules/ip/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiPermission("ip.access");
    const { id } = await params;
    const admission = await getAdmission(id);
    if (!admission) {
      return NextResponse.json({ error: "Admission not found" }, { status: 404 });
    }
    return NextResponse.json({ admission });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.access");
    const { id } = await params;
    const input = await parseBody(updateAdmissionSchema, req);
    const admission = await updateAdmission(id, input, user);
    return NextResponse.json({ admission });
  } catch (error) {
    return handleApiError(error);
  }
}
