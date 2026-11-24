import "server-only";
import type { Payment, Prisma, User } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { formatINR } from "@/modules/shared/money";
import {
  createInvoiceSchema,
  createPaymentSchema,
  reconcilePaymentSchema,
  type CreateInvoiceInput,
  type CreatePaymentInput,
  type ReconcilePaymentInput,
} from "./schemas";
import { computeOutstanding } from "./outstanding";
import { triggerPaymentReceiptSmsAsync } from "@/modules/communication/sms-service";

export { computeOutstanding } from "./outstanding";

type Tx = Prisma.TransactionClient;

function formatSequence(prefix: string, year: number, value: number, width: number) {
  return `${prefix}-${year}-${String(value).padStart(width, "0")}`;
}

/**
 * Atomically increments and returns a yearly counter (Postgres upsert), safe
 * under concurrency. Runs inside the caller's transaction so generated numbers
 * are only committed together with the row that uses them.
 */
export async function nextSequence(
  tx: Tx,
  kind: "UHID" | "INVOICE" | "RECEIPT" | "OPV" | "APPOINTMENT" | "DENTAL" | "LAB" | "PHARM" | "IP" | string,
  year: number,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "SequenceCounter" ("year", "kind", "value")
    VALUES (${year}, ${kind}, 1)
    ON CONFLICT ("year", "kind")
    DO UPDATE SET "value" = "SequenceCounter"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

export type PaymentResult = {
  payment: Payment & { change: number | null };
  invoice: {
    id: string;
    invoiceNo: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    outstanding: number;
  };
  duplicate: boolean;
};

/**
 * Creates a payment atomically:
 *  - idempotent via idempotencyKey (double submit returns the original payment)
 *  - invoice row locked with SELECT … FOR UPDATE (concurrent collections serialised)
 *  - outstanding recomputed from SUCCESS payments on the server
 *  - invoice status/paidAmount + audit log written in the same transaction
 */
export async function createPayment(
  rawInput: CreatePaymentInput,
  user: User,
): Promise<PaymentResult> {
  const input = createPaymentSchema.parse(rawInput);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // ---- Idempotency: same key ⇒ same payment, no side effects.
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) {
          const invoice = await tx.invoice.findUniqueOrThrow({
            where: { id: existing.invoiceId },
          });
          return {
            payment: { ...existing, change: null },
            invoice: {
              id: invoice.id,
              invoiceNo: invoice.invoiceNo,
              status: invoice.status,
              totalAmount: invoice.totalAmount,
              paidAmount: invoice.paidAmount,
              outstanding: computeOutstanding(
                invoice.totalAmount,
                invoice.paidAmount,
              ),
            },
            duplicate: true,
          };
        }

        // ---- Lock the invoice row so two counters can't overpay at once.
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE`;

        const invoice = await tx.invoice.findUnique({
          where: { id: input.invoiceId },
          include: {
            payments: { select: { status: true, amount: true } },
            refunds: { select: { status: true, amount: true } },
          },
        });
        if (!invoice) throw new ApiError(404, "Invoice not found");
        if (invoice.status === "CANCELLED") {
          throw new ApiError(409, "Cancelled invoices cannot accept payments");
        }

        // ---- Unique transaction reference (UTR / card ref / bank ref).
        const ref = input.transactionRef?.trim() || null;
        if (ref) {
          const duplicate = await tx.payment.findUnique({
            where: { transactionRef: ref },
          });
          if (duplicate) {
            throw new ApiError(
              409,
              `Transaction reference "${ref}" is already recorded against receipt ${duplicate.receiptNo}. Each reference can only be used once.`,
              { field: "transactionRef" },
            );
          }
        }

        // ---- Recompute outstanding on the server; never trust the client.
        // Approved refunds reduce the money actually retained on the invoice.
        const successPaid = invoice.payments
          .filter((p) => p.status === "SUCCESS")
          .reduce((sum, p) => sum + p.amount, 0);
        const refunded = invoice.refunds
          .filter((refund) => refund.status === "APPROVED")
          .reduce((sum, refund) => sum + refund.amount, 0);
        const netPaid = Math.max(successPaid - refunded, 0);
        const outstanding = computeOutstanding(invoice.totalAmount, netPaid);

        if (input.amount > outstanding) {
          throw new ApiError(
            400,
            `Payment amount ${formatINR(input.amount)} exceeds the outstanding balance of ${formatINR(outstanding)}.`,
            { field: "amount", outstanding },
          );
        }

        const year = new Date().getFullYear();
        const receiptNo = formatSequence(
          "RCPT",
          year,
          await nextSequence(tx, "RECEIPT", year),
          5,
        );

        const newPaid = Math.max(successPaid + input.amount - refunded, 0);
        const newStatus =
          newPaid >= invoice.totalAmount ? ("PAID" as const) : ("PARTIALLY_PAID" as const);
        const newOutstanding = computeOutstanding(invoice.totalAmount, newPaid);

        const payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            receiptNo,
            method: input.method,
            amount: input.amount,
            transactionRef: ref,
            status: "SUCCESS",
            reconciliationStatus: "PENDING",
            collectedBy: user.id,
            idempotencyKey: input.idempotencyKey,
          },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount: newPaid, status: newStatus },
        });

        await writeAuditLog(tx, {
          userId: user.id,
          action: "PAYMENT_CREATED",
          entity: "Payment",
          entityId: payment.id,
          after: {
            receiptNo,
            invoiceNo: invoice.invoiceNo,
            amount: input.amount,
            method: input.method,
            transactionRef: ref,
            invoiceStatus: newStatus,
            paidAmount: newPaid,
            outstanding: newOutstanding,
          },
        });

        return {
          payment: {
            ...payment,
            change:
              input.method === "CASH" && input.amountReceived !== undefined
                ? input.amountReceived - input.amount
                : null,
          },
          invoice: {
            id: invoice.id,
            invoiceNo: invoice.invoiceNo,
            status: newStatus,
            totalAmount: invoice.totalAmount,
            paidAmount: newPaid,
            outstanding: newOutstanding,
          },
          duplicate: false,
        };
      },
      { timeout: 15_000, maxWait: 5_000 },
    );

    // Asynchronously trigger payment confirmation SMS (non-blocking)
    if (!result.duplicate && result.payment.status === "SUCCESS") {
      triggerPaymentReceiptSmsAsync(
        {
          id: result.payment.id,
          receiptNo: result.payment.receiptNo,
          amount: result.payment.amount,
          method: result.payment.method,
          status: result.payment.status,
          invoiceId: result.invoice.id,
        },
        user.id,
      );
    }

    return result;
  } catch (error) {
    // Unique constraint race on transactionRef / idempotencyKey.
    if (
      error instanceof PrismaNS.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? String(error.meta.target.join(","))
        : String(error.meta?.target ?? "");
      if (target.includes("transactionRef")) {
        throw new ApiError(
          409,
          "This transaction reference has already been recorded. Each reference can only be used once.",
          { field: "transactionRef" },
        );
      }
      if (target.includes("idempotencyKey")) {
        const existing = await prisma.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) {
          const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: existing.invoiceId },
          });
          return {
            payment: { ...existing, change: null },
            invoice: {
              id: invoice.id,
              invoiceNo: invoice.invoiceNo,
              status: invoice.status,
              totalAmount: invoice.totalAmount,
              paidAmount: invoice.paidAmount,
              outstanding: computeOutstanding(
                invoice.totalAmount,
                invoice.paidAmount,
              ),
            },
            duplicate: true,
          };
        }
      }
    }
    throw error;
  }
}

/** Marks a UPI/Bank payment as RECONCILED or MISMATCH (Accounts + Admin). */
export async function reconcilePayment(
  paymentId: string,
  rawInput: ReconcilePaymentInput,
  user: User,
) {
  const input = reconcilePaymentSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: { select: { invoiceNo: true } } },
      });
      if (!payment) throw new ApiError(404, "Payment not found");
      if (payment.method !== "UPI" && payment.method !== "BANK_TRANSFER") {
        throw new ApiError(
          400,
          "Only UPI and bank transfer payments can be reconciled",
        );
      }
      if (payment.reconciliationStatus !== "PENDING") {
        throw new ApiError(
          409,
          `Payment is already marked as ${payment.reconciliationStatus.toLowerCase()}`,
        );
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          reconciliationStatus: input.status,
          reconciliationNote: input.note || null,
          reconciledBy: user.id,
          reconciledAt: new Date(),
        },
      });

      await writeAuditLog(tx, {
        userId: user.id,
        action: "PAYMENT_RECONCILED",
        entity: "Payment",
        entityId: payment.id,
        before: { reconciliationStatus: payment.reconciliationStatus },
        after: {
          reconciliationStatus: input.status,
          note: input.note || null,
          receiptNo: payment.receiptNo,
          invoiceNo: payment.invoice.invoiceNo,
          amount: payment.amount,
        },
      });

      return updated;
    },
    { timeout: 10_000 },
  );
}

/**
 * Creates an invoice. totalAmount is ALWAYS the sum of the line items — the
 * client never gets to state a total.
 */
export async function createInvoice(rawInput: CreateInvoiceInput, user: User) {
  const input = createInvoiceSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { id: input.patientId },
      });
      if (!patient) throw new ApiError(404, "Patient not found");

      const totalAmount = input.items.reduce((sum, item) => sum + item.amount, 0);
      const year = new Date().getFullYear();
      const invoiceNo = formatSequence(
        "INV",
        year,
        await nextSequence(tx, "INVOICE", year),
        5,
      );

      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          patientId: patient.id,
          department: input.department,
          billType: input.billType,
          status: "UNPAID",
          totalAmount,
          paidAmount: 0,
          createdBy: user.id,
          items: {
            create: input.items.map((item) => ({
              category: item.category,
              description: item.description,
              amount: item.amount,
            })),
          },
        },
        include: { items: true },
      });

      await writeAuditLog(tx, {
        userId: user.id,
        action: "INVOICE_CREATED",
        entity: "Invoice",
        entityId: invoice.id,
        after: {
          invoiceNo,
          patientUhid: patient.uhid,
          department: input.department,
          billType: input.billType,
          totalAmount,
          itemCount: input.items.length,
        },
      });

      return invoice;
    },
    { timeout: 15_000 },
  );
}
