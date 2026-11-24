import type { Department, InvoiceItem, InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeOutstanding } from "./service";
import type { InvoiceListQuery } from "./schemas";

function startOfDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  return d;
}

function endOfDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return d;
}

export type InvoiceListResult = {
  items: (Prisma.InvoiceGetPayload<{
    include: { patient: { select: { name: true; uhid: true; phone: true } } };
  }> & { outstanding: number })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Server-side paginated invoice list: search (invoice no / patient name / UHID)
 * plus status, department and date-range filters.
 */
export async function listInvoices(query: InvoiceListQuery): Promise<InvoiceListResult> {
  const { page, pageSize, q, status, department, from, to } = query;

  const where: Prisma.InvoiceWhereInput = {
    ...(status.length
      ? { status: { in: status as InvoiceStatus[] } }
      : {}),
    ...(department.length
      ? { department: { in: department as Department[] } }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: startOfDay(from) } : {}),
            ...(to ? { lte: endOfDay(to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" } },
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { uhid: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { name: true, uhid: true, phone: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      outstanding: computeOutstanding(row.totalAmount, row.paidAmount),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type InvoiceDetail = Prisma.InvoiceGetPayload<{
  include: {
    patient: true;
    items: true;
    payments: { include: { collector: { select: { name: true } } } };
    creator: { select: { name: true } };
    admission: { select: { admissionNo: true } };
    refunds: {
      include: {
        requestedBy: { select: { name: true } };
        approvedBy: { select: { name: true } };
      };
    };
  };
}> & {
  outstanding: number;
  /** SUCCESS payments only — recomputed at read time, never trusted from the column. */
  successPaid: number;
  /** APPROVED refunds only. Pending requests do not change the balance. */
  refundedAmount: number;
  /** successPaid − refundedAmount, floored at zero. */
  netPaid: number;
  itemsByCategory: { category: string; items: InvoiceItem[] }[];
};

const CATEGORY_ORDER = [
  "SERVICE_CHARGES",
  "LABORATORY",
  "PHARMACY",
  "ROOM_CHARGES",
  "DOCTOR_CONSULTATION",
  "OTHER_CHARGES",
];

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      patient: true,
      items: true,
      payments: {
        orderBy: { createdAt: "desc" },
        include: { collector: { select: { name: true } } },
      },
      creator: { select: { name: true } },
      admission: { select: { admissionNo: true } },
      refunds: {
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!invoice) return null;

  const successPaid = invoice.payments
    .filter((p) => p.status === "SUCCESS")
    .reduce((sum, p) => sum + p.amount, 0);

  const refundedAmount = invoice.refunds
    .filter((refund) => refund.status === "APPROVED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const netPaid = Math.max(successPaid - refundedAmount, 0);

  const byCategory = new Map<string, typeof invoice.items>();
  for (const item of invoice.items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const itemsByCategory = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map(
    (category) => ({ category, items: byCategory.get(category)! }),
  );

  return {
    ...invoice,
    successPaid,
    refundedAmount,
    netPaid,
    outstanding: computeOutstanding(invoice.totalAmount, netPaid),
    itemsByCategory,
  };
}

/** Refunds waiting for a finance decision, oldest first. */
export async function listPendingRefunds(take = 50) {
  return prisma.refund.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take,
    include: {
      payment: { select: { receiptNo: true } },
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          patient: { select: { name: true, uhid: true } },
        },
      },
      requestedBy: { select: { name: true } },
    },
  });
}

/** Payments on an invoice with reconciliation-aware presentation fields. */
export async function getInvoicePayments(invoiceId: string) {
  return prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
    include: { collector: { select: { name: true } } },
  });
}

export type ReconciliationListItem = Prisma.PaymentGetPayload<{
  include: {
    invoice: {
      select: { invoiceNo: true; department: true; patient: { select: { name: true; uhid: true } } };
    };
    collector: { select: { name: true } };
  };
}>;

/** Accounts view: UPI/Bank payments still awaiting reconciliation. */
export async function listPendingReconciliation(params: {
  page: number;
  pageSize: number;
  q?: string;
}) {
  const { page, pageSize, q } = params;

  const where: Prisma.PaymentWhereInput = {
    method: { in: ["UPI", "BANK_TRANSFER"] },
    reconciliationStatus: "PENDING",
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: "insensitive" } },
            { transactionRef: { contains: q, mode: "insensitive" } },
            { invoice: { invoiceNo: { contains: q, mode: "insensitive" } } },
            { invoice: { patient: { name: { contains: q, mode: "insensitive" } } } },
            { invoice: { patient: { uhid: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoice: {
          select: {
            invoiceNo: true,
            department: true,
            patient: { select: { name: true, uhid: true } },
          },
        },
        collector: { select: { name: true } },
      },
    }),
  ]);

  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Full payment record for the receipt screen. */
export async function getPaymentForReceipt(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      collector: { select: { name: true, role: true } },
      reconciler: { select: { name: true } },
      invoice: {
        include: {
          patient: true,
          payments: {
            orderBy: { createdAt: "asc" },
            include: { collector: { select: { name: true } } },
          },
          items: true,
          refunds: { select: { status: true, amount: true } },
        },
      },
    },
  });
}

export async function getHospitalSettings() {
  const settings = await prisma.hospitalSettings.findFirst();
  return (
    settings ?? {
      id: 1,
      hospitalName: "AHLAIN HOSPITAL",
      address: "",
      upiId: "ahlainhospital@upi",
      upiQrImageUrl: "/brand/upi-qr.png",
      receiptFooter: "",
      termsText: "",
      logoImageUrl: "",
      tagline: "New Horizons, Better Health.",
      phone: "",
      email: "",
      website: "",
      gstin: "",
      signatureImageUrl: "",
      updatedAt: new Date(),
    }
  );
}
