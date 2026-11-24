import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createRefundSchema } from "@/modules/billing/schemas";
import { createRefund } from "@/modules/billing/refunds";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("billing.collect");
    const input = await parseBody(createRefundSchema, req);
    const refund = await createRefund(input, user);
    return NextResponse.json({ refund }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
