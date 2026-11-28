import type { Patient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeOutstanding } from "@/modules/billing/outstanding";
import type { PatientListQuery } from "./schemas";
import { buildPatientSearchFilter, normalizePatientQuery } from "./search-filter";

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

  const where: Prisma.PatientWhereInput = {
    ...(gender ? { gender } : {}),
    ...buildPatientSearchFilter(q),
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

const PATIENT_SEARCH_SELECT = {
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
} satisfies Prisma.PatientSelect;

/** Promotes exact and prefix matches above mid-name matches. */
function relevanceRank(
  patient: PatientSearchResult,
  term: string,
  tokens: string[],
): number {
  const name = patient.name.toLowerCase();
  const uhid = patient.uhid.toLowerCase();
  const phone = patient.phone.toLowerCase();

  if (uhid === term || phone === term) return 0;
  if (name === term) return 1;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.some((part) => tokens.some((token) => part.startsWith(token)))) {
    return 2;
  }
  if (name.startsWith(term)) return 3;
  if (uhid.startsWith(term)) return 4;
  if (phone.startsWith(term)) return 5;
  return 6;
}

/**
 * Live autocomplete search over every registered patient: partial,
 * case-insensitive matches on the full name (first, middle and last name),
 * UHID and phone. Accepts a single character and never needs the full name.
 * Results are ranked so the closest matches appear first, and only a bounded
 * page is fetched from PostgreSQL.
 */
export async function searchPatients(
  query: string,
  limit = 10,
): Promise<PatientSearchResult[]> {
  const term = normalizePatientQuery(query).toLowerCase();
  if (!term) return [];

  const capped = Math.min(Math.max(1, Math.trunc(Number(limit)) || 10), 50);
  const rows = await prisma.patient.findMany({
    where: buildPatientSearchFilter(term),
    // Fetch a small multiple of the page so prefix matches can be promoted
    // without ever loading the directory into memory.
    take: Math.min(capped * 4, 200),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: PATIENT_SEARCH_SELECT,
  });

  const tokens = term.split(" ");
  return rows
    .map((row) => {
      const patient = row as PatientSearchResult;
      return {
        patient,
        rank: relevanceRank(patient, term, tokens),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.patient.name.localeCompare(b.patient.name))
    .slice(0, capped)
    .map(({ patient }) => patient);
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
