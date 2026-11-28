import "server-only";
import { prisma } from "@/lib/prisma";
import { computeOutstanding } from "@/modules/billing/outstanding";

export type TimelineEvent = {
  date: Date;
  type: string;
  title: string;
  detail: string;
  href?: string;
};

/**
 * Everything the patient profile needs, read from the live tables. Nothing is
 * synthesised: a section is empty when the hospital has no record for it.
 */
export async function getPatientClinicalHistory(patientId: string) {
  const [opVisits, admissions, labOrders, prescriptions, invoices, documents] = await Promise.all([
    prisma.oPVisit.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: { doctor: { select: { name: true } }, nurse: { select: { name: true } } },
    }),
    prisma.admission.findMany({
      where: { patientId },
      orderBy: { admissionDate: "desc" },
      include: {
        bed: { select: { bedNumber: true, ward: true, roomNo: true } },
        admittingDoctor: { select: { name: true } },
        attendingDoctor: { select: { name: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, paidAmount: true, status: true } },
      },
    }),
    prisma.labOrder.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        tests: { orderBy: { sortOrder: "asc" } },
        results: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        orderedBy: { select: { name: true } },
        verifiedBy: { select: { name: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, paidAmount: true, status: true } },
        documents: {
          select: { id: true, filename: true, reportNo: true, reportDate: true, matchConfidence: true },
        },
      },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        dispensedBy: { select: { name: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, itemCode: true, batchNumber: true, unitPricePaise: true, expiryDate: true },
            },
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.labReportDocument.findMany({
      where: { patientId },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, filename: true, reportNo: true, reportDate: true, sourceFolder: true },
    }),
  ]);

  const invoiceRows = invoices.map((invoice) => {
    const paid = invoice.payments
      .filter((payment) => payment.status === "SUCCESS")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const pharmacyMarker = invoice.items.some(
      (item) => item.category === "PHARMACY" || item.description.startsWith("[AH-PHARM"),
    );
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      department: invoice.department,
      serviceType: pharmacyMarker ? "PHARMACY" : invoice.department,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      outstanding: computeOutstanding(invoice.totalAmount, paid),
      createdAt: invoice.createdAt,
      items: invoice.items.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        amount: item.amount,
      })),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        receiptNo: payment.receiptNo,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt,
      })),
    };
  });

  const payments = invoiceRows
    .flatMap((invoice) =>
      invoice.payments.map((payment) => ({ ...payment, invoiceNo: invoice.invoiceNo })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const dispensedItems = prescriptions.flatMap((prescription) =>
    prescription.items
      .filter((item) => item.dispensedQuantity > 0)
      .map((item) => ({
        prescriptionId: prescription.id,
        dispenseNo: prescription.dispenseNo,
        status: prescription.status,
        dispensedAt: prescription.dispensedAt,
        dispensedByName: prescription.dispensedBy?.name ?? null,
        medicineName: item.medicine.name,
        medicineCode: item.medicine.itemCode,
        batchNumber: item.medicine.batchNumber,
        quantity: item.quantity,
        dispensedQuantity: item.dispensedQuantity,
        returnedQuantity: item.returnedQuantity,
        unitPricePaise: item.unitPricePaise,
        totalPaise: item.totalPaise,
        dosage: item.dosage,
      })),
  );

  const timeline: TimelineEvent[] = [];
  for (const visit of opVisits) {
    timeline.push({
      date: visit.createdAt,
      type: "OP",
      title: `OP visit ${visit.opNo}`,
      detail: [visit.doctor.name, visit.provisionalDiagnosis].filter(Boolean).join(" · "),
      href: "/op",
    });
  }
  for (const admission of admissions) {
    timeline.push({
      date: admission.admissionDate,
      type: "IP",
      title: `Admitted ${admission.admissionNo}`,
      detail: [admission.ward, admission.bed.bedNumber, admission.diagnosis].filter(Boolean).join(" · "),
      href: "/ip",
    });
    if (admission.dischargeDate) {
      timeline.push({
        date: admission.dischargeDate,
        type: "DISCHARGE",
        title: `Discharged ${admission.admissionNo}`,
        detail: admission.dischargeType ?? "",
        href: "/ip",
      });
    }
  }
  for (const order of labOrders) {
    timeline.push({
      date: order.createdAt,
      type: "LAB",
      title: `Lab ${order.orderNo}`,
      detail: order.tests.length
        ? order.tests.map((test) => test.testName).join(", ")
        : order.testName,
      href: `/laboratory/${order.id}/report`,
    });
    if (order.verifiedAt) {
      timeline.push({
        date: order.verifiedAt,
        type: "LAB_REPORT",
        title: `Report verified ${order.reportNo ?? order.orderNo}`,
        detail: order.verifiedBy?.name ?? "",
        href: `/laboratory/${order.id}/report`,
      });
    }
  }
  for (const prescription of prescriptions) {
    timeline.push({
      date: prescription.createdAt,
      type: "PRESCRIPTION",
      title: `Prescription ${prescription.dispenseNo}`,
      detail: `${prescription.items.length} medicine${prescription.items.length === 1 ? "" : "s"} · ${prescription.status}`,
      href: "/pharmacy",
    });
    if (prescription.dispensedAt) {
      timeline.push({
        date: prescription.dispensedAt,
        type: "DISPENSED",
        title: `Dispensed ${prescription.dispenseNo}`,
        detail: prescription.dispensedBy?.name ?? "",
        href: "/pharmacy",
      });
    }
  }
  for (const invoice of invoiceRows) {
    timeline.push({
      date: invoice.createdAt,
      type: "INVOICE",
      title: `Invoice ${invoice.invoiceNo}`,
      detail: `${invoice.department} · ₹${(invoice.totalAmount / 100).toFixed(2)}`,
      href: `/billing/invoices/${invoice.id}`,
    });
    for (const payment of invoice.payments) {
      if (payment.status !== "SUCCESS") continue;
      timeline.push({
        date: payment.createdAt,
        type: "PAYMENT",
        title: `Payment ${payment.receiptNo}`,
        detail: `${payment.method} · ₹${(payment.amount / 100).toFixed(2)}`,
        href: `/billing/receipts/${payment.id}`,
      });
    }
  }
  for (const document of documents) {
    timeline.push({
      date: document.reportDate ?? new Date(0),
      type: "LAB_PDF",
      title: `Report PDF ${document.reportNo ?? document.filename}`,
      detail: document.sourceFolder ?? "",
      href: `/documents/reports/${document.id}`,
    });
  }

  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    opVisits,
    admissions,
    labOrders,
    prescriptions,
    dispensedItems,
    invoiceRows,
    payments,
    documents,
    timeline,
  };
}
