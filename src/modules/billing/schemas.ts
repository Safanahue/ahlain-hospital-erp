import { z } from "zod";
import {
  BillType,
  Department,
  InvoiceStatus,
  ItemCategory,
  PaymentMethod,
} from "@prisma/client";

/** CSV enum param: "PAID,UNPAID" → ["PAID","UNPAID"] (validated against enum values). */
function csvEnum(values: readonly string[]) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw?.trim()) return [] as string[];
      const items = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = items.filter((i) => !values.includes(i));
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid value: ${invalid.join(", ")}`,
        });
        return z.NEVER;
      }
      return items;
    });
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .optional();

/** GET /api/billing/invoices — server-side pagination, search and filters. */
export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  q: z
    .string()
    .trim()
    .max(120, "Search term is too long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: csvEnum(Object.values(InvoiceStatus)),
  department: csvEnum(Object.values(Department)),
  from: dateString,
  to: dateString,
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/**
 * POST /api/billing/invoices/:id/payments
 * amount is in PAISE; the server recomputes the outstanding balance and never
 * trusts this value beyond sanity checks.
 */
export const createPaymentSchema = z
  .object({
    invoiceId: z.string().min(1, "Invoice is required"),
    amount: z
      .number({ message: "Amount is required" })
      .int("Amount must be a whole rupee value")
      .positive("Amount must be greater than zero"),
    method: z.nativeEnum(PaymentMethod),
    transactionRef: z
      .string()
      .trim()
      .max(64, "Reference is too long")
      .optional()
      .default(""),
    /** Cash only: notes/handled amount, used to compute change. */
    amountReceived: z
      .number()
      .int("Amount received must be a whole rupee value")
      .positive()
      .optional(),
    /** Client-generated UUID; makes retries/double submits idempotent. */
    idempotencyKey: z.string().uuid("Invalid idempotency key"),
  })
  .superRefine((value, ctx) => {
    const ref = value.transactionRef ?? "";
    if (value.method === "UPI") {
      if (!/^\d{12}$/.test(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transactionRef"],
          message: "UPI transaction reference must be exactly 12 digits",
        });
      }
    } else if (value.method === "CARD" || value.method === "BANK_TRANSFER") {
      if (ref.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transactionRef"],
          message: "Transaction reference is required for card and bank payments",
        });
      }
    } else if (value.method === "CASH" && value.amountReceived !== undefined) {
      if (value.amountReceived < value.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amountReceived"],
          message: "Amount received cannot be less than the payment amount",
        });
      }
    }
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** POST /api/billing/payments/:id/reconcile */
export const reconcilePaymentSchema = z
  .object({
    status: z.enum(["RECONCILED", "MISMATCH"]),
    note: z.string().trim().max(500, "Note is too long").optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.status === "MISMATCH" && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A note is required when marking a payment as a mismatch",
      });
    }
  });
export type ReconcilePaymentInput = z.infer<typeof reconcilePaymentSchema>;

/** POST /api/billing/invoices — totals are always recomputed server-side. */
export const createInvoiceSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  department: z.nativeEnum(Department),
  billType: z.nativeEnum(BillType).default("GENERAL"),
  items: z
    .array(
      z.object({
        category: z.nativeEnum(ItemCategory),
        description: z.string().trim().min(1, "Description is required").max(200),
        amount: z
          .number({ message: "Amount is required" })
          .int("Amount must be a whole rupee value")
          .positive("Amount must be greater than zero"),
      }),
    )
    .min(1, "Add at least one line item")
    .max(100),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** POST /api/refunds — request a refund against one successful payment. */
export const createRefundSchema = z.object({
  paymentId: z.string().min(1, "Payment is required"),
  amount: z
    .number({ message: "Refund amount is required" })
    .int("Amount must be a whole rupee value")
    .positive("Refund amount must be greater than zero"),
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason for the refund")
    .max(300, "Reason is too long"),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

/** POST /api/refunds/:id/reject */
export const rejectRefundSchema = z.object({
  note: z.string().trim().max(300, "Note is too long").optional().default(""),
});
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

/** GET /api/billing/reconciliation */
export const reconciliationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
