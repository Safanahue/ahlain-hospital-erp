import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { reconcilePaymentSchema } from "@/modules/billing/schemas";
import { reconcilePayment } from "@/modules/billing/service";

/**
 * POST /api/billing/payments/:id/reconcile
 * Accounts + Admin only. Writes an audit log entry in the same transaction.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("billing.reconcile");
    const { id } = await params;
    const input = await parseBody(reconcilePaymentSchema, req);
    const payment = await reconcilePayment(id, input, user);
    return NextResponse.json({ payment });
  } catch (error) {
    return handleApiError(error);
  }
}
