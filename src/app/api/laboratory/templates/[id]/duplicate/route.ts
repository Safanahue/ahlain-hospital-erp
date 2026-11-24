import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { duplicateTemplateSchema } from "@/modules/laboratory/schemas";
import { duplicateTemplate } from "@/modules/laboratory/presets";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("lab.masters");
    const { id } = await params;
    const input = await parseBody(duplicateTemplateSchema, req);
    const template = await duplicateTemplate(id, input ?? {}, user);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
