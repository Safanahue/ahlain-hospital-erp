import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createOpVisitSchema, opVisitsQuerySchema } from "@/modules/op/schemas";
import { createOpVisit, listOpVisits } from "@/modules/op/service";

/** GET /api/op/visits — list visits for a date. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("op.access");
    const { date } = await opVisitsQuerySchema(req);
    const visits = await listOpVisits(date);
    return NextResponse.json({ items: visits, total: visits.length });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/op/visits — register one OP visit (Doctor/Admin/Nurse/Reception). */
export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("op.access");
    const input = await parseBody(createOpVisitSchema, req);
    const result = await createOpVisit(input, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
