import type { Patient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeOutstanding } from "@/modules/billing/outstanding";
import type { PatientListQuery } from "./schemas";

export type PatientListResult = {
  items: Patient[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Server-side paginated patient directory: search (name / UHID / phone) + gender. */
export async function listPatients(
  query: PatientListQuery,
): Promise<PatientListResult> {
  const { page, pageSize, q, gender } = query;

  const tokens = (q ?? "").trim().split(/\s+/).filter(Boolean);
  const qFilter: Prisma.PatientWhereInput =
    tokens.length > 1
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { name: { contains: t, mode: "insensitive" } },
              { uhid: { contains: t, mode: "insensitive" } },
              { phone: { contains: t } },
            ],
          })),
        }
      : tokens.length === 1
        ? {
            OR: [
              { name: { contains: tokens[0], mode: "insensitive" } },
              { uhid: { contains: tokens[0], mode: "insensitive" } },
              { phone: { contains: tokens[0] } },
            ],
          }
        : {};

  const where: Prisma.PatientWhereInput = {
    ...(gender ? { gender } : {}),
    ...qFilter,
  };

  const [total, rows] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
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

export type PatientSearchResult = {
  id: string;
  uhid: string;
  name: string;
  phone: string;
  age: number;
  gender: string;
  dob: Date | null;
  bloodGroup: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/** Fast live search for autocomplete matching name, UHID or phone across partial tokens. */
export async function searchPatients(
  query: string,
  limit = 10,
): Promise<PatientSearchResult[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length < 2) {
    return [];
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const where: Prisma.PatientWhereInput =
    tokens.length > 1
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { name: { contains: t, mode: "insensitive" } },
              { uhid: { contains: t, mode: "insensitive" } },
              { phone: { contains: t } },
            ],
          })),
        }
      : {
          OR: [
            { name: { contains: tokens[0], mode: "insensitive" } },
            { uhid: { contains: tokens[0], mode: "insensitive" } },
            { phone: { contains: tokens[0] } },
          ],
        };

  const rows = await prisma.patient.findMany({
    where,
    take: Math.min(Math.max(1, limit), 50),
    orderBy: { name: "asc" },
    select: {
      id: true,
      uhid: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      dob: true,
      bloodGroup: true,
      address: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
  });

  return rows as PatientSearchResult[];
}

export type PatientInvoiceRow = {
  id: string;
  invoiceNo: string;
  department: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  createdAt: Date;
  itemCount: number;
};

export type PatientPaymentRow = {
  id: string;
  receiptNo: string;
  invoiceNo: string;
  method: string;
  status: string;
  amount: number;
  createdAt: Date;
};

export type PatientDetail = {
  patient: Patient;
  /** Billing timeline — rendered only for roles in BILLING_VIEW_ROLES. */
  invoices: PatientInvoiceRow[];
  payments: PatientPaymentRow[];
  summary: {
    invoiceCount: number;
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
  };
};

/**
 * Patients 360: demographics + the billing timeline built from the existing
 * Invoice/Payment tables (appointments and visits arrive in later waves).
 * Outstanding is recomputed from SUCCESS payments at read time.
 */
export async function getPatientDetail(
  id: string,
): Promise<PatientDetail | null> {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      invoices: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { id: true } },
          payments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              receiptNo: true,
              method: true,
              status: true,
              amount: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!patient) return null;

  let totalBilled = 0;
  let totalPaid = 0;

  const invoices: PatientInvoiceRow[] = patient.invoices.map((invoice) => {
    const successPaid = invoice.payments
      .filter((payment) => payment.status === "SUCCESS")
      .reduce((sum, payment) => sum + payment.amount, 0);

    totalBilled += invoice.status === "CANCELLED" ? 0 : invoice.totalAmount;
    totalPaid += invoice.status === "CANCELLED" ? 0 : successPaid;

    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      department: invoice.department,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      outstanding: computeOutstanding(invoice.totalAmount, successPaid),
      createdAt: invoice.createdAt,
      itemCount: invoice.items.length,
    };
  });

  const payments: PatientPaymentRow[] = patient.invoices
    .flatMap((invoice) =>
      invoice.payments.map((payment) => ({
        ...payment,
        invoiceNo: invoice.invoiceNo,
      })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  return {
    patient: {
      id: patient.id,
      uhid: patient.uhid,
      name: patient.name,
      phone: patient.phone,
      age: patient.age,
      gender: patient.gender,
      dob: patient.dob,
      bloodGroup: patient.bloodGroup,
      address: patient.address,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    },
    invoices,
    payments,
    summary: {
      invoiceCount: invoices.length,
      totalBilled,
      totalPaid,
      outstanding: computeOutstanding(totalBilled, totalPaid),
    },
  };
}
