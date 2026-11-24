import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { rejectRefundSchema } from "@/modules/billing/schemas";
import { rejectRefund } from "@/modules/billing/refunds";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("billing.reconcile");
    const { id } = await params;
    const input = await parseBody(rejectRefundSchema, req);
    const refund = await rejectRefund(id, input, user);
    return NextResponse.json({ refund });
  } catch (error) {
    return handleApiError(error);
  }
}
