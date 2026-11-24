import "server-only";
import type { Prisma, Refund, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { formatINR } from "@/modules/shared/money";
import { nextSequence } from "./service";
import {
  createRefundSchema,
  rejectRefundSchema,
  type CreateRefundInput,
  type RejectRefundInput,
} from "./schemas";

type Tx = Prisma.TransactionClient;

function refundNumber(year: number, value: number) {
  return `RFD-${year}-${String(value).padStart(5, "0")}`;
}

/** Money still refundable on one payment: amount − refunds that are not rejected. */
export async function refundableForPayment(tx: Tx, paymentId: string) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: { select: { amount: true, status: true } } },
  });
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.status !== "SUCCESS") {
    throw new ApiError(409, "Only successful payments can be refunded");
  }
  const reserved = payment.refunds
    .filter((refund) => refund.status !== "REJECTED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  return { payment, refundable: Math.max(payment.amount - reserved, 0) };
}

/**
 * Requests a refund. Pending refunds reserve the money immediately, so two
 * staff members cannot request the same amount twice; the invoice balance only
 * changes when a finance user approves it.
 */
export async function createRefund(
  rawInput: CreateRefundInput,
  actor: User,
): Promise<Refund> {
  const input = createRefundSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE`;
    const { payment, refundable } = await refundableForPayment(tx, input.paymentId);

    if (input.amount > refundable) {
      throw new ApiError(
        400,
        `Refund amount ${formatINR(input.amount)} exceeds the refundable balance of ${formatINR(refundable)}.`,
        { field: "amount", refundable },
      );
    }

    const year = new Date().getFullYear();
    const refundNo = refundNumber(year, await nextSequence(tx, "REFUND", year));

    const refund = await tx.refund.create({
      data: {
        refundNo,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: input.amount,
        reason: input.reason,
        requestedById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "REFUND_REQUESTED",
      entity: "Refund",
      entityId: refund.id,
      after: {
        refundNo,
        paymentId: payment.id,
        receiptNo: payment.receiptNo,
        amount: input.amount,
        reason: input.reason,
      },
    });

    return refund;
  });
}

/**
 * Approves a pending refund and rebuilds the invoice balance from the truth:
 * net paid = SUCCESS payments − APPROVED refunds.
 */
export async function approveRefund(id: string, actor: User): Promise<Refund> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Refund" WHERE "id" = ${id} FOR UPDATE`;

    const refund = await tx.refund.findUnique({
      where: { id },
      include: {
        payment: { include: { refunds: { select: { id: true, amount: true, status: true } } } },
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
    });
    if (!refund) throw new ApiError(404, "Refund not found");
    if (refund.status !== "PENDING") {
      throw new ApiError(409, `This refund is already ${refund.status.toLowerCase()}.`);
    }

    const otherReserved = refund.payment.refunds
      .filter((row) => row.id !== refund.id && row.status !== "REJECTED")
      .reduce((sum, row) => sum + row.amount, 0);
    if (refund.amount > refund.payment.amount - otherReserved) {
      throw new ApiError(
        409,
        "This refund would exceed the original payment amount. Reject it and request a smaller amount.",
      );
    }

    const approved = await tx.refund.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
    });

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: refund.invoiceId },
      include: {
        payments: { select: { status: true, amount: true } },
        refunds: { select: { status: true, amount: true } },
      },
    });

    const grossPaid = invoice.payments
      .filter((payment) => payment.status === "SUCCESS")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const refunded = invoice.refunds
      .filter((row) => row.status === "APPROVED")
      .reduce((sum, row) => sum + row.amount, 0);
    const netPaid = Math.max(grossPaid - refunded, 0);

    const status =
      invoice.status === "CANCELLED"
        ? "CANCELLED"
        : netPaid >= invoice.totalAmount
          ? "PAID"
          : netPaid > 0
            ? "PARTIALLY_PAID"
            : "UNPAID";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: netPaid, status },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "REFUND_APPROVED",
      entity: "Refund",
      entityId: refund.id,
      before: { status: "PENDING", invoiceStatus: invoice.status, paidAmount: invoice.paidAmount },
      after: {
        status: "APPROVED",
        refundNo: refund.refundNo,
        amount: refund.amount,
        invoiceNo: invoice.invoiceNo,
        netPaid,
        invoiceStatus: status,
      },
    });

    return approved;
  });
}

export async function rejectRefund(
  id: string,
  rawInput: RejectRefundInput,
  actor: User,
): Promise<Refund> {
  const input = rejectRefundSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id } });
    if (!refund) throw new ApiError(404, "Refund not found");
    if (refund.status !== "PENDING") {
      throw new ApiError(409, `This refund is already ${refund.status.toLowerCase()}.`);
    }

    const rejected = await tx.refund.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: actor.id,
        approvedAt: new Date(),
        rejectionNote: input.note || "Rejected",
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "REFUND_REJECTED",
      entity: "Refund",
      entityId: refund.id,
      before: { status: "PENDING" },
      after: {
        status: "REJECTED",
        refundNo: refund.refundNo,
        amount: refund.amount,
        note: input.note,
      },
    });

    return rejected;
  });
}
