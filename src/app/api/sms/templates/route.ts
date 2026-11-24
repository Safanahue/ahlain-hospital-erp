import { NextResponse } from "next/server";
import { requireApiUser } from "@/modules/auth/guards";
import {
  getSmsTemplates,
  updateSmsTemplate,
} from "@/modules/communication/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiUser(["ADMIN"]);
    const templates = getSmsTemplates();
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch SMS templates" },
      { status: err.status || 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(["ADMIN"]);
    const body = await request.json();

    const { code, templateText, dltTemplateId } = body;
    if (!code || !templateText?.trim()) {
      return NextResponse.json(
        { error: "Template code and template text are required" },
        { status: 400 },
      );
    }

    const updated = updateSmsTemplate(code, templateText, dltTemplateId);
    if (!updated) {
      return NextResponse.json(
        { error: "Template code not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      templates: getSmsTemplates(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update SMS template" },
      { status: err.status || 500 },
    );
  }
}
