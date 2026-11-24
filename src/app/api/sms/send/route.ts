import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/modules/auth/guards";
import { ApiError, handleApiError, parseBody } from "@/modules/shared/api";
import { computeOutstanding } from "@/modules/billing/service";
import { getHospitalSettings, getInvoiceDetail, getPaymentForReceipt } from "@/modules/billing/queries";
import { paymentLinkMessage, receiptMessage } from "@/modules/communication/messages";
import { sendSms, isSmsConfigured } from "@/modules/communication/sms";
import { isAutoSmsEnabled } from "@/modules/communication/sms-service";

export const runtime = "nodejs";

const sendSmsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("receipt"), paymentId: z.string().min(1) }),
  z.object({ kind: z.literal("payment_link"), invoiceId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("billing.collect");
    const input = await parseBody(sendSmsSchema, req);
    const settings = await getHospitalSettings();

    let to: string | null = null;
    let body = "";
    let entityId = "";

    if (input.kind === "receipt") {
      const payment = await getPaymentForReceipt(input.paymentId);
      if (!payment) throw new ApiError(404, "Payment not found");
      if (payment.status !== "SUCCESS") {
        throw new ApiError(400, "Only successful payments can be sent by SMS.");
      }

      const paid = payment.invoice.payments
        .filter((row) => row.status === "SUCCESS")
        .reduce((sum, row) => sum + row.amount, 0);

      to = payment.invoice.patient.phone;
      entityId = payment.id;
      body = receiptMessage({
        hospitalName: settings.hospitalName,
        receiptNo: payment.receiptNo,
        amountPaise: payment.amount,
        invoiceNo: payment.invoice.invoiceNo,
        outstandingPaise: computeOutstanding(payment.invoice.totalAmount, paid),
      });
    } else {
      const invoice = await getInvoiceDetail(input.invoiceId);
      if (!invoice) throw new ApiError(404, "Invoice not found");

      to = invoice.patient.phone;
      entityId = invoice.id;
      body = paymentLinkMessage({
        hospitalName: settings.hospitalName,
        invoiceNo: invoice.invoiceNo,
        outstandingPaise: invoice.outstanding,
        upiId: settings.upiId,
      });
    }

    if (!to) {
      throw new ApiError(400, "This patient has no phone number on file.");
    }

    if (!isAutoSmsEnabled()) {
      throw new ApiError(
        403,
        "Patient SMS is temporarily paused while preparing safe live testing. Please use the Admin SMS Testing page to test delivery to your verified Admin phone number.",
      );
    }

    const result = await sendSms({
      to,
      body,
      kind: input.kind === "receipt" ? "RECEIPT" : "PAYMENT_LINK",
      entityId,
      userId: user.id,
      allowResend: true,
    });

    if (result.status === "SKIPPED") {
      if (!isSmsConfigured()) {
        throw new ApiError(
          503,
          "SMS is not configured on this server. Ask an administrator to add the SMS gateway keys.",
        );
      }
      if (result.error?.includes("Duplicate")) {
        return NextResponse.json({
          status: "SENT",
          to: result.to,
          message: "SMS has already been sent to this patient.",
        });
      }
      throw new ApiError(400, result.error ?? "SMS delivery was skipped.");
    }

    if (result.status === "FAILED") {
      throw new ApiError(
        502,
        `SMS delivery failed: ${result.error ?? "gateway error"}`,
      );
    }

    return NextResponse.json({
      status: result.status,
      to: result.to,
      message: body,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
