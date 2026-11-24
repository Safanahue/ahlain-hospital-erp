import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { ApiError, handleApiError, parseBody } from "@/modules/shared/api";
import { createPaymentSchema } from "@/modules/billing/schemas";
import { createPayment } from "@/modules/billing/service";

/**
 * POST /api/billing/invoices/:id/payments
 * Idempotent (idempotencyKey), transactional, server-recomputed amounts.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiPermission("billing.collect");
    const { id } = await params;
    const input = await parseBody(createPaymentSchema, req);
    if (input.invoiceId !== id) {
      throw new ApiError(400, "Invoice id in the body does not match the URL");
    }
    const result = await createPayment(input, user);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
