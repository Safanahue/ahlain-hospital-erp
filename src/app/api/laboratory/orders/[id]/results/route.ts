import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { saveResultsSchema } from "@/modules/laboratory/schemas";
import { saveOrderResults } from "@/modules/laboratory/results";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("lab.results");
    const { id } = await params;
    const input = await parseBody(saveResultsSchema, req);
    const result = await saveOrderResults(id, input, user);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
