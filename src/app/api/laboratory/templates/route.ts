import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createTemplateSchema, templateListQuerySchema } from "@/modules/laboratory/schemas";
import { createTemplate, listTemplates } from "@/modules/laboratory/presets";

export async function GET(req: Request) {
  try {
    await requireApiPermission("lab.access");
    const query = parseQuery(templateListQuerySchema, req);
    const templates = await listTemplates({
      q: query.q,
      category: query.category,
      includeInactive: query.includeInactive !== "false",
    });
    return NextResponse.json({ items: templates, total: templates.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("lab.masters");
    const input = await parseBody(createTemplateSchema, req);
    const template = await createTemplate(input, user);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
