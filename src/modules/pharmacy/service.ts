import "server-only";
import type { User, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModulePermission } from "@/modules/auth/require-permission";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import { dispenseMarker } from "./queries";
import {
  cancelPrescriptionSchema,
  createMedicineSchema,
  createPrescriptionSchema,
  stockMovementSchema,
  type CancelPrescriptionInput,
  type CreateMedicineInput,
  type CreatePrescriptionInput,
  type StockMovementInput,
} from "./schemas";

type Tx = Prisma.TransactionClient;

async function assertCanAccessPharmacy(actor: User) {
  await requireModulePermission(actor, "pharmacy.access");
}

function pharmacyDispenseNo(year: number, value: number): string {
  return `AH-PHARM-${year}-${String(value).padStart(4, "0")}`;
}

function invoiceNo(year: number, value: number): string {
  return `INV-${year}-${String(value).padStart(5, "0")}`;
}

/**
 * Full medicine list. Kept for callers that genuinely need every active item;
 * screens must use listMedicinesPaged so the register stays fast.
 */
export async function listMedicines(options?: { search?: string; category?: string }) {
  const where: Prisma.MedicineWhereInput = { active: true };

  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { itemCode: { contains: options.search, mode: "insensitive" } },
    ];
  }

  if (options?.category && options.category !== "ALL") {
    where.category = options.category;
  }

  return prisma.medicine.findMany({ where, orderBy: { name: "asc" } });
}

export async function getMedicine(id: string) {
  const medicine = await prisma.medicine.findUnique({ where: { id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");
  return medicine;
}

export async function createMedicine(rawInput: CreateMedicineInput, actor: User) {
  await assertCanAccessPharmacy(actor);
  const input = createMedicineSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.medicine.findUnique({
      where: { itemCode: input.itemCode },
    });
    if (existing) {
      throw new ApiError(
        400,
        `Medicine with code "${input.itemCode}" already exists. Record a stock receipt instead of creating a duplicate item.`,
      );
    }

    const medicine = await tx.medicine.create({
      data: {
        itemCode: input.itemCode,
        name: input.name,
        category: input.category,
        manufacturer: input.manufacturer || null,
        batchNumber: input.batchNumber,
        expiryDate: new Date(input.expiryDate),
        stockQuantity: input.stockQuantity,
        unitPricePaise: Math.round(input.unitPriceRupees * 100),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "MEDICINE_CREATED",
      entity: "Medicine",
      entityId: medicine.id,
      before: null,
      after: {
        itemCode: medicine.itemCode,
        name: medicine.name,
        stock: medicine.stockQuantity,
        quantity: medicine.stockQuantity,
        batchNumber: medicine.batchNumber,
        reason: "New medicine added to the catalogue",
      },
    });

    return medicine;
  });
}

const INCREASING_KINDS = new Set(["RECEIPT", "RETURN"]);

/**
 * Records a stock movement (receipt, issue, return or adjustment) against one
 * medicine. The quantity changes inside a row-locked transaction and can never
 * go below zero, so the register and the ledger cannot drift apart.
 */
export async function recordStockMovement(
  medicineId: string,
  rawInput: StockMovementInput,
  actor: User,
) {
  await assertCanAccessPharmacy(actor);
  const input = stockMovementSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Medicine" WHERE "id" = ${medicineId} FOR UPDATE`;

      const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
      if (!medicine) throw new ApiError(404, "Medicine not found");

      const delta = INCREASING_KINDS.has(input.kind) ? input.quantity : -input.quantity;
      const nextStock = medicine.stockQuantity + delta;

      if (nextStock < 0) {
        throw new ApiError(
          400,
          `Only ${medicine.stockQuantity} unit(s) of "${medicine.name}" are in stock. A movement of ${input.quantity} would make the stock negative.`,
        );
      }

      const updated = await tx.medicine.update({
        where: { id: medicine.id },
        data: {
          stockQuantity: nextStock,
          ...(input.batchNumber ? { batchNumber: input.batchNumber } : {}),
          ...(input.expiryDate ? { expiryDate: new Date(input.expiryDate) } : {}),
          ...(input.unitPriceRupees !== undefined
            ? { unitPricePaise: Math.round(input.unitPriceRupees * 100) }
            : {}),
        },
      });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: `MEDICINE_STOCK_${input.kind}`,
        entity: "Medicine",
        entityId: medicine.id,
        before: { stock: medicine.stockQuantity, batchNumber: medicine.batchNumber },
        after: {
          stock: updated.stockQuantity,
          quantity: input.quantity,
          kind: input.kind,
          reason: input.reason,
          batchNumber: updated.batchNumber,
          itemCode: updated.itemCode,
          name: updated.name,
        },
      });

      return { medicine: updated, delta };
    },
    { timeout: 15_000 },
  );
}

export async function listPrescriptions(options?: {
  status?: string;
  patientId?: string;
  range?: { gte: Date; lt: Date };
  take?: number;
}) {
  const where: Prisma.PrescriptionWhereInput = {};
  if (options?.status && options.status !== "ALL") {
    where.status = options.status;
  }
  if (options?.patientId) {
    where.patientId = options.patientId;
  }
  if (options?.range) {
    where.createdAt = options.range;
  }

  return prisma.prescription.findMany({
    where,
    include: {
      patient: { select: { id: true, name: true, uhid: true, phone: true } },
      dispensedBy: { select: { id: true, name: true } },
      items: { include: { medicine: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options?.take ?? 50,
  });
}

export async function createPrescription(rawInput: CreatePrescriptionInput, actor: User) {
  await assertCanAccessPharmacy(actor);
  const input = createPrescriptionSchema.parse(rawInput);

  // Duplicate lines make stock and billing ambiguous — merge them first.
  const merged = new Map<string, { quantity: number; dosage?: string }>();
  for (const item of input.items) {
    const current = merged.get(item.medicineId);
    if (current) {
      current.quantity += item.quantity;
      if (item.dosage) current.dosage = item.dosage;
    } else {
      merged.set(item.medicineId, { quantity: item.quantity, dosage: item.dosage });
    }
  }

  return prisma.$transaction(async (tx) => {
    const medicineIds = [...merged.keys()];
    const medicines = await tx.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== medicineIds.length) {
      throw new ApiError(400, "One or more selected medicines could not be found");
    }

    const medMap = new Map(medicines.map((m) => [m.id, m]));

    let totalPaise = 0;
    const itemRecords = [...merged.entries()].map(([medicineId, line]) => {
      const med = medMap.get(medicineId)!;
      const linePaise = med.unitPricePaise * line.quantity;
      totalPaise += linePaise;

      return {
        medicineId: med.id,
        quantity: line.quantity,
        unitPricePaise: med.unitPricePaise,
        totalPaise: linePaise,
        dosage: line.dosage || null,
      };
    });

    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "PHARM", year);

    const prescription = await tx.prescription.create({
      data: {
        dispenseNo: pharmacyDispenseNo(year, seqNo),
        patientId: input.patientId,
        prescribedBy: input.prescribedBy || actor.name,
        instructions: input.instructions || null,
        totalPaise,
        status: "PENDING",
        items: { create: itemRecords },
      },
      include: {
        patient: { select: { id: true, name: true, uhid: true, phone: true } },
        items: { include: { medicine: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "PRESCRIPTION_CREATED",
      entity: "Prescription",
      entityId: prescription.id,
      before: null,
      after: {
        dispenseNo: prescription.dispenseNo,
        patientId: prescription.patientId,
        totalPaise,
      },
    });

    return prescription;
  });
}

/**
 * Bills a dispensing record on the patient's invoice.
 *  - one invoice per dispensing record (duplicate-safe via the dispense marker)
 *  - created inside the caller's transaction, using the same billing tables
 *  - zero-value records create no invoice, so legacy price-less items never
 *    produce empty bills
 */
async function ensurePharmacyInvoice(
  tx: Tx,
  prescription: {
    dispenseNo: string;
    patientId: string;
    totalPaise: number;
    items: {
      quantity: number;
      totalPaise: number;
      dosage: string | null;
      medicine: { name: string };
    }[];
  },
  actor: User,
) {
  const marker = dispenseMarker(prescription.dispenseNo);

  const existing = await tx.invoice.findFirst({
    where: {
      patientId: prescription.patientId,
      items: { some: { description: { contains: marker } } },
    },
    select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
  });
  if (existing) return existing;

  if (prescription.totalPaise <= 0) return null;

  const year = new Date().getFullYear();
  const numberOf = invoiceNo(year, await nextSequence(tx, "INVOICE", year));

  const invoice = await tx.invoice.create({
    data: {
      invoiceNo: numberOf,
      patientId: prescription.patientId,
      department: "PHARMACY",
      billType: "GENERAL",
      status: "UNPAID",
      totalAmount: prescription.totalPaise,
      paidAmount: 0,
      createdBy: actor.id,
      items: {
        create: prescription.items.map((item) => ({
          category: "PHARMACY" as const,
          description: `${item.medicine.name} - ${item.quantity} unit(s)${
            item.dosage ? ` (${item.dosage})` : ""
          } ${marker}`,
          amount: item.totalPaise,
        })),
      },
    },
    select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
  });

  await writeAuditLog(tx, {
    userId: actor.id,
    action: "INVOICE_CREATED",
    entity: "Invoice",
    entityId: invoice.id,
    before: null,
    after: {
      invoiceNo: invoice.invoiceNo,
      patientId: prescription.patientId,
      department: "PHARMACY",
      billType: "GENERAL",
      totalAmount: prescription.totalPaise,
      itemCount: prescription.items.length,
      source: "PHARMACY_DISPENSE",
      dispenseNo: prescription.dispenseNo,
    },
  });

  return invoice;
}

/**
 * Dispenses a prescription: locks the row, deducts stock per line with a
 * guarded update (never negative), records the stock movements and creates the
 * pharmacy invoice — all in one transaction.
 */
export async function dispensePrescription(id: string, actor: User) {
  await assertCanAccessPharmacy(actor);

  return prisma.$transaction(
    async (tx) => {
      // Lock the prescription row so a double click or retry cannot deduct twice.
      await tx.$queryRaw`SELECT "id" FROM "Prescription" WHERE "id" = ${id} FOR UPDATE`;

      const rx = await tx.prescription.findUnique({
        where: { id },
        include: { items: { include: { medicine: true } } },
      });

      if (!rx) throw new ApiError(404, "Prescription not found");
      if (rx.status !== "PENDING") {
        throw new ApiError(400, `Prescription is already ${rx.status}`);
      }

      for (const item of rx.items) {
        const result = await tx.medicine.updateMany({
          where: { id: item.medicineId, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (result.count !== 1) {
          const fresh = await tx.medicine.findUnique({
            where: { id: item.medicineId },
            select: { name: true, stockQuantity: true },
          });
          throw new ApiError(
            400,
            `Insufficient stock for "${fresh?.name ?? item.medicine.name}". Available: ${
              fresh?.stockQuantity ?? 0
            }, Required: ${item.quantity}`,
          );
        }

        const after = await tx.medicine.findUniqueOrThrow({
          where: { id: item.medicineId },
          select: { stockQuantity: true, name: true },
        });

        await writeAuditLog(tx, {
          userId: actor.id,
          action: "MEDICINE_STOCK_DEDUCTED",
          entity: "Medicine",
          entityId: item.medicineId,
          before: { stock: after.stockQuantity + item.quantity },
          after: {
            stock: after.stockQuantity,
            quantity: item.quantity,
            reason: `Dispensed on ${rx.dispenseNo}`,
            name: after.name,
          },
        });
      }

      const updated = await tx.prescription.update({
        where: { id },
        data: { status: "DISPENSED", dispensedById: actor.id, dispensedAt: new Date() },
        include: {
          patient: { select: { id: true, name: true, uhid: true } },
          dispensedBy: { select: { id: true, name: true } },
          items: { include: { medicine: true } },
        },
      });

      const invoice = await ensurePharmacyInvoice(
        tx,
        {
          dispenseNo: updated.dispenseNo,
          patientId: updated.patientId,
          totalPaise: updated.totalPaise,
          items: updated.items.map((item) => ({
            quantity: item.quantity,
            totalPaise: item.totalPaise,
            dosage: item.dosage,
            medicine: { name: item.medicine.name },
          })),
        },
        actor,
      );

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "PRESCRIPTION_DISPENSED",
        entity: "Prescription",
        entityId: updated.id,
        before: { status: "PENDING" },
        after: {
          status: "DISPENSED",
          dispensedById: actor.id,
          invoiceNo: invoice?.invoiceNo ?? null,
        },
      });

      return { prescription: updated, invoice };
    },
    { timeout: 20_000 },
  );
}

/**
 * Cancels a prescription.
 *  - PENDING: nothing is reversed because nothing was dispensed.
 *  - DISPENSED: every line returns to stock and the pharmacy invoice is
 *    cancelled when nothing has been paid against it. A paid invoice must be
 *    refunded through Billing first, so money and stock always agree.
 */
export async function cancelPrescription(
  id: string,
  rawInput: CancelPrescriptionInput,
  actor: User,
) {
  await assertCanAccessPharmacy(actor);
  const input = cancelPrescriptionSchema.parse(rawInput);

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Prescription" WHERE "id" = ${id} FOR UPDATE`;

      const rx = await tx.prescription.findUnique({
        where: { id },
        include: { items: { include: { medicine: true } } },
      });
      if (!rx) throw new ApiError(404, "Prescription not found");
      if (rx.status === "CANCELLED") {
        throw new ApiError(400, "Prescription is already cancelled");
      }

      const invoice = await tx.invoice.findFirst({
        where: {
          patientId: rx.patientId,
          items: { some: { description: { contains: dispenseMarker(rx.dispenseNo) } } },
        },
        include: { payments: { where: { status: "SUCCESS" }, select: { amount: true } } },
      });

      if (rx.status === "DISPENSED") {
        const paid = invoice
          ? invoice.payments.reduce((sum, p) => sum + p.amount, 0)
          : 0;
        if (invoice && (paid > 0 || invoice.status === "PAID")) {
          throw new ApiError(
            409,
            `Invoice ${invoice.invoiceNo} has payments recorded. Refund it in Billing → Reconciliation, then cancel this prescription.`,
          );
        }

        for (const item of rx.items) {
          const updated = await tx.medicine.update({
            where: { id: item.medicineId },
            data: { stockQuantity: { increment: item.quantity } },
          });

          await writeAuditLog(tx, {
            userId: actor.id,
            action: "MEDICINE_STOCK_RETURN",
            entity: "Medicine",
            entityId: item.medicineId,
            before: { stock: updated.stockQuantity - item.quantity },
            after: {
              stock: updated.stockQuantity,
              quantity: item.quantity,
              reason: `Returned from ${rx.dispenseNo}: ${input.reason}`,
              name: updated.name,
            },
          });
        }

        if (invoice && invoice.status !== "CANCELLED") {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: "CANCELLED" },
          });
          await writeAuditLog(tx, {
            userId: actor.id,
            action: "INVOICE_CANCELLED",
            entity: "Invoice",
            entityId: invoice.id,
            before: { status: invoice.status },
            after: {
              status: "CANCELLED",
              invoiceNo: invoice.invoiceNo,
              reason: `Pharmacy return of ${rx.dispenseNo}`,
            },
          });
        }
      }

      const cancelled = await tx.prescription.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: {
          patient: { select: { id: true, name: true, uhid: true } },
          dispensedBy: { select: { id: true, name: true } },
          items: { include: { medicine: true } },
        },
      });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "PRESCRIPTION_CANCELLED",
        entity: "Prescription",
        entityId: cancelled.id,
        before: { status: rx.status },
        after: {
          status: "CANCELLED",
          reason: input.reason,
          stockRestored: rx.status === "DISPENSED",
          invoiceNo: invoice?.invoiceNo ?? null,
        },
      });

      return { prescription: cancelled, invoice };
    },
    { timeout: 20_000 },
  );
}
