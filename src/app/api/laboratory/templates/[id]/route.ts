import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { updateTemplateSchema } from "@/modules/laboratory/schemas";
import { deleteTemplate, getTemplate, updateTemplate } from "@/modules/laboratory/presets";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiPermission("lab.access");
    const { id } = await params;
    const template = await getTemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Report preset not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("lab.masters");
    const { id } = await params;
    const input = await parseBody(updateTemplateSchema, req);
    const template = await updateTemplate(id, input, user);
    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("lab.masters");
    const { id } = await params;
    await deleteTemplate(id, user);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return handleApiError(error);
  }
}
