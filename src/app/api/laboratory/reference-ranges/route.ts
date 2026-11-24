import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createRefRangeSchema, refRangeQuerySchema } from "@/modules/laboratory/schemas";
import {
  createReferenceRange,
  listReferenceRangeCategories,
  listReferenceRanges,
} from "@/modules/laboratory/service";

export async function GET(req: Request) {
  try {
    await requireApiPermission("lab.access");
    const query = refRangeQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { testName, serviceId, category, q } = query;

    const ranges = await listReferenceRanges({ testName, serviceId, category, q });
    const categories = await listReferenceRangeCategories();
    return NextResponse.json({ items: ranges, total: ranges.length, categories });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("lab.masters");
    const input = await parseBody(createRefRangeSchema, req);
    const range = await createReferenceRange(input, user);
    return NextResponse.json({ range }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
