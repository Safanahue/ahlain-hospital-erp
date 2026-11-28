import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { getReportDocument } from "@/modules/laboratory/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiPermission("lab.access");
    const { id } = await params;
    const document = await getReportDocument(id);
    if (!document) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(document.bytes), {
      headers: {
        "Content-Type": document.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
