import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  LOW_STOCK_THRESHOLD,
  NEAR_EXPIRY_DAYS,
  type MedicineListQuery,
  type PrescriptionListQuery,
} from "./schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDayKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function endOfDayKey(key: string): Date {
  return new Date(`${key}T23:59:59.999`);
}

/** Marker appended to invoice lines created from a dispensing record. */
export function dispenseMarker(dispenseNo: string): string {
  return `[${dispenseNo}]`;
}

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function pageMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Paginated medicine inventory. Historical (inactive) items stay searchable
 * through includeInactive, so nothing disappears from the register.
 */
export async function listMedicinesPaged(
  query: MedicineListQuery,
): Promise<Paged<Awaited<ReturnType<typeof findMedicines>>[number]>> {
  const { page, pageSize, q, category, stock, includeInactive } = query;
  const now = startOfDay(new Date());
  const nearExpiry = new Date(now.getTime() + NEAR_EXPIRY_DAYS * DAY_MS);

  const stockFilter: Prisma.MedicineWhereInput =
    stock === "low"
      ? { stockQuantity: { gt: 0, lt: LOW_STOCK_THRESHOLD } }
      : stock === "out"
        ? { stockQuantity: { lte: 0 } }
        : stock === "expiring"
          ? { expiryDate: { gte: now, lte: nearExpiry } }
          : stock === "expired"
            ? { expiryDate: { lt: now } }
            : {};

  const where: Prisma.MedicineWhereInput = {
    ...(includeInactive ? {} : { active: true }),
    ...(category ? { category } : {}),
    ...stockFilter,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { itemCode: { contains: q, mode: "insensitive" } },
            { manufacturer: { contains: q, mode: "insensitive" } },
            { batchNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.medicine.count({ where }),
    findMedicines(where, (page - 1) * pageSize, pageSize),
  ]);

  return { items: rows, ...pageMeta(total, page, pageSize) };
}

function findMedicines(where: Prisma.MedicineWhereInput, skip: number, take: number) {
  return prisma.medicine.findMany({
    where,
    orderBy: [{ name: "asc" }, { batchNumber: "asc" }],
    skip,
    take,
  });
}

export type PharmacyStats = {
  catalogueItems: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  expired: number;
  pendingPrescriptions: number;
  dispensedPrescriptions: number;
  stockUnits: number;
};

/** KPI numbers for the pharmacy dashboard (single round trip of counts). */
export async function getPharmacyStats(): Promise<PharmacyStats> {
  const now = startOfDay(new Date());
  const nearExpiry = new Date(now.getTime() + NEAR_EXPIRY_DAYS * DAY_MS);

  const [
    catalogueItems,
    lowStock,
    outOfStock,
    expiringSoon,
    expired,
    pendingPrescriptions,
    dispensedPrescriptions,
    stockAgg,
  ] = await Promise.all([
    prisma.medicine.count({ where: { active: true } }),
    prisma.medicine.count({
      where: { active: true, stockQuantity: { gt: 0, lt: LOW_STOCK_THRESHOLD } },
    }),
    prisma.medicine.count({ where: { active: true, stockQuantity: { lte: 0 } } }),
    prisma.medicine.count({
      where: { active: true, expiryDate: { gte: now, lte: nearExpiry } },
    }),
    prisma.medicine.count({ where: { active: true, expiryDate: { lt: now } } }),
    prisma.prescription.count({ where: { status: "PENDING" } }),
    prisma.prescription.count({ where: { status: "DISPENSED" } }),
    prisma.medicine.aggregate({
      where: { active: true },
      _sum: { stockQuantity: true },
    }),
  ]);

  return {
    catalogueItems,
    lowStock,
    outOfStock,
    expiringSoon,
    expired,
    pendingPrescriptions,
    dispensedPrescriptions,
    stockUnits: stockAgg._sum.stockQuantity ?? 0,
  };
}

/** Medicines for the prescription picker: small, fast, server-side search. */
export async function searchMedicinesForPicker(search: string, take = 12) {
  return prisma.medicine.findMany({
    where: {
      active: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { itemCode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      itemCode: true,
      category: true,
      stockQuantity: true,
      unitPricePaise: true,
      batchNumber: true,
      expiryDate: true,
    },
    orderBy: [{ stockQuantity: "desc" }, { name: "asc" }],
    take,
  });
}

export type PrescriptionRow = Prisma.PrescriptionGetPayload<{
  include: {
    patient: { select: { id: true; name: true; uhid: true; phone: true } };
    dispensedBy: { select: { id: true; name: true } };
    items: { include: { medicine: true } };
  };
}>;

/**
 * Paginated dispensing queue. No date range is applied unless the user asks
 * for one, so historical prescriptions are never hidden by default.
 */
export async function listPrescriptionsPaged(
  query: PrescriptionListQuery,
): Promise<Paged<PrescriptionRow>> {
  const { page, pageSize, q, status, from, to } = query;

  const where: Prisma.PrescriptionWhereInput = {
    ...(status !== "ALL" ? { status } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: startOfDayKey(from) } : {}),
            ...(to ? { lte: endOfDayKey(to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { dispenseNo: { contains: q, mode: "insensitive" } },
            { prescribedBy: { contains: q, mode: "insensitive" } },
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { uhid: { contains: q, mode: "insensitive" } } },
            { patient: { phone: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, name: true, uhid: true, phone: true } },
        dispensedBy: { select: { id: true, name: true } },
        items: { include: { medicine: true } },
      },
    }),
  ]);

  return { items: rows, ...pageMeta(total, page, pageSize) };
}

export type PrescriptionInvoice = {
  id: string;
  invoiceNo: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
};

/** Finds the invoice a dispensing record was billed to, if any. */
export async function findInvoiceForDispense(
  patientId: string,
  dispenseNo: string,
): Promise<PrescriptionInvoice | null> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      patientId,
      items: { some: { description: { contains: dispenseMarker(dispenseNo) } } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      totalAmount: true,
      paidAmount: true,
    },
  });
  return invoice;
}

/** One query for the whole visible page of prescriptions. */
export async function mapInvoicesToPrescriptions(
  rows: PrescriptionRow[],
): Promise<Map<string, PrescriptionInvoice>> {
  const result = new Map<string, PrescriptionInvoice>();
  if (rows.length === 0) return result;

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: rows.map((rx) => ({
        patientId: rx.patientId,
        items: { some: { description: { contains: dispenseMarker(rx.dispenseNo) } } },
      })),
    },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      totalAmount: true,
      paidAmount: true,
      patientId: true,
      items: { select: { description: true } },
    },
  });

  for (const rx of rows) {
    const marker = dispenseMarker(rx.dispenseNo);
    // Both the patient and the dispense marker must match, so a shared marker
    // can never attach another patient's invoice to this prescription.
    const match = invoices.find(
      (inv) =>
        inv.patientId === rx.patientId &&
        inv.items.some((item) => item.description.includes(marker)),
    );
    if (match) result.set(rx.id, match);
  }
  return result;
}

export type StockMovementRow = {
  id: string;
  createdAt: Date;
  action: string;
  user: string | null;
  delta: number;
  before: number | null;
  after: number | null;
  reason: string | null;
  batchNumber: string | null;
};

const STOCK_ACTIONS = [
  "MEDICINE_STOCK_RECEIPT",
  "MEDICINE_STOCK_ISSUE",
  "MEDICINE_STOCK_RETURN",
  "MEDICINE_STOCK_ADJUSTMENT",
  "MEDICINE_STOCK_DEDUCTED",
  "MEDICINE_CREATED",
];

/** Stock transaction history, built from the audit trail (no extra table). */
export async function listStockMovements(
  medicineId?: string,
  take = 40,
): Promise<StockMovementRow[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      entity: "Medicine",
      action: { in: STOCK_ACTIONS },
      ...(medicineId ? { entityId: medicineId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { name: true } } },
  });

  return logs.map((log) => {
    const after = (log.after ?? {}) as Record<string, unknown>;
    const before = (log.before ?? {}) as Record<string, unknown>;
    const afterStock = typeof after.stock === "number" ? after.stock : null;
    const beforeStock = typeof before.stock === "number" ? before.stock : null;
    const quantity = typeof after.quantity === "number" ? after.quantity : null;
    const delta =
      beforeStock !== null && afterStock !== null
        ? afterStock - beforeStock
        : quantity !== null
          ? -quantity
          : 0;

    return {
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      user: log.user?.name ?? null,
      delta,
      before: beforeStock,
      after: afterStock,
      reason: typeof after.reason === "string" ? after.reason : null,
      batchNumber: typeof after.batchNumber === "string" ? after.batchNumber : null,
    };
  });
}
