import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { listReportDocumentsForZip } from "@/modules/laboratory/documents";
import { createZip } from "@/modules/shared/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireApiPermission("lab.access");
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const documents = await listReportDocumentsForZip(ids.length ? ids : undefined);
    if (documents.length === 0) {
      return NextResponse.json({ error: "No archived reports to download" }, { status: 404 });
    }

    const used = new Set<string>();
    const entries = documents.map((document) => {
      const prefix = document.patient?.uhid ? `${document.patient.uhid}-` : "unlinked-";
      let name = `${prefix}${document.filename}`;
      let counter = 1;
      while (used.has(name)) {
        counter += 1;
        name = `${prefix}${counter}-${document.filename}`;
      }
      used.add(name);
      return { name, data: new Uint8Array(document.bytes) };
    });

    return new NextResponse(Buffer.from(createZip(entries)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ahlain-lab-reports.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
