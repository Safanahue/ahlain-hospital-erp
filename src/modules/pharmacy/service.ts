import "server-only";
import type { User, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { PHARMACY_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { nextSequence } from "@/modules/billing/service";
import {
  createMedicineSchema,
  createPrescriptionSchema,
  type CreateMedicineInput,
  type CreatePrescriptionInput,
} from "./schemas";

function assertCanAccessPharmacy(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, PHARMACY_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function pharmacyDispenseNo(year: number, value: number): string {
  return `AH-PHARM-${year}-${String(value).padStart(4, "0")}`;
}

export async function listMedicines(options?: { search?: string; category?: string }) {
  const where: Prisma.MedicineWhereInput = {
    active: true,
  };

  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { itemCode: { contains: options.search, mode: "insensitive" } },
    ];
  }

  if (options?.category && options.category !== "ALL") {
    where.category = options.category;
  }

  return prisma.medicine.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function createMedicine(rawInput: CreateMedicineInput, actor: User) {
  assertCanAccessPharmacy(actor);
  const input = createMedicineSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.medicine.findUnique({
      where: { itemCode: input.itemCode },
    });
    if (existing) {
      throw new ApiError(400, `Medicine with code "${input.itemCode}" already exists`);
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
      },
    });

    return medicine;
  });
}

export async function listPrescriptions(options?: {
  status?: string;
  patientId?: string;
  range?: { gte: Date; lt: Date };
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
      items: {
        include: {
          medicine: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function createPrescription(rawInput: CreatePrescriptionInput, actor: User) {
  assertCanAccessPharmacy(actor);
  const input = createPrescriptionSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    // Validate all medicines and compute totals
    const medicineIds = input.items.map((it) => it.medicineId);
    const medicines = await tx.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== medicineIds.length) {
      throw new ApiError(400, "One or more selected medicines could not be found");
    }

    const medMap = new Map(medicines.map((m) => [m.id, m]));

    let totalPaise = 0;
    const itemRecords = input.items.map((it) => {
      const med = medMap.get(it.medicineId)!;
      const linePaise = med.unitPricePaise * it.quantity;
      totalPaise += linePaise;

      return {
        medicineId: med.id,
        quantity: it.quantity,
        unitPricePaise: med.unitPricePaise,
        totalPaise: linePaise,
        dosage: it.dosage || null,
      };
    });

    const year = new Date().getFullYear();
    const seqNo = await nextSequence(tx, "PHARM" as any, year);

    const prescription = await tx.prescription.create({
      data: {
        dispenseNo: pharmacyDispenseNo(year, seqNo),
        patientId: input.patientId,
        prescribedBy: input.prescribedBy || actor.name,
        instructions: input.instructions || null,
        totalPaise,
        status: "PENDING",
        items: {
          create: itemRecords,
        },
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

export async function dispensePrescription(id: string, actor: User) {
  assertCanAccessPharmacy(actor);

  return prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.findUnique({
      where: { id },
      include: { items: { include: { medicine: true } } },
    });

    if (!rx) throw new ApiError(404, "Prescription not found");
    if (rx.status !== "PENDING") {
      throw new ApiError(400, `Prescription is already ${rx.status}`);
    }

    // Check stock availability
    for (const item of rx.items) {
      if (item.medicine.stockQuantity < item.quantity) {
        throw new ApiError(
          400,
          `Insufficient stock for "${item.medicine.name}". Available: ${item.medicine.stockQuantity}, Required: ${item.quantity}`,
        );
      }
    }

    // Deduct stock for each item
    for (const item of rx.items) {
      await tx.medicine.update({
        where: { id: item.medicineId },
        data: {
          stockQuantity: {
            decrement: item.quantity,
          },
        },
      });
    }

    // Mark prescription dispensed
    const updated = await tx.prescription.update({
      where: { id },
      data: {
        status: "DISPENSED",
        dispensedById: actor.id,
        dispensedAt: new Date(),
      },
      include: {
        patient: { select: { id: true, name: true, uhid: true } },
        dispensedBy: { select: { id: true, name: true } },
        items: { include: { medicine: true } },
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "PRESCRIPTION_DISPENSED",
      entity: "Prescription",
      entityId: updated.id,
      before: { status: "PENDING" },
      after: { status: "DISPENSED", dispensedById: actor.id },
    });

    return updated;
  });
}
