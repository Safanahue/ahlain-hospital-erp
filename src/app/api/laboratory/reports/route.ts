import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { listReportDocuments } from "@/modules/laboratory/documents";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireApiPermission("lab.access");
    const url = new URL(req.url);
    const linked = url.searchParams.get("linked");
    const result = await listReportDocuments({
      q: url.searchParams.get("q") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      linked: linked === "linked" || linked === "unlinked" ? linked : "all",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
