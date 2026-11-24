import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { approveRefund } from "@/modules/billing/refunds";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("billing.reconcile");
    const { id } = await params;
    const refund = await approveRefund(id, user);
    return NextResponse.json({ refund });
  } catch (error) {
    return handleApiError(error);
  }
}
