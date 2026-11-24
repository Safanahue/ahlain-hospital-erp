import { prisma } from "@/lib/prisma";

export async function getAdminDashboardStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    todayRevenue,
    outstandingAgg,
    statusCounts,
    recentInvoices,
    totalPatients,
    recentPatients,
    recentPayments,
    todayOpCount,
    activeAdmissionsCount,
    bedsAgg,
    pendingLabCount,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: "SUCCESS", createdAt: { gte: startOfDay } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        invoiceNo: true,
        department: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        patient: { select: { name: true, uhid: true } },
      },
    }),
    prisma.patient.count(),
    prisma.patient.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        uhid: true,
        phone: true,
        gender: true,
        age: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceNo: true,
            patient: { select: { name: true } },
          },
        },
      },
    }),
    prisma.oPVisit.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.admission.count({
      where: { status: "ADMITTED" },
    }),
    prisma.bed.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.labOrder.count({
      where: { status: { in: ["ORDERED", "SAMPLE_COLLECTED", "RESULT_ENTERED"] } },
    }),
  ]);

  const counts = Object.fromEntries(
    statusCounts.map((row) => [row.status, row._count._all]),
  );

  const bedCounts = Object.fromEntries(
    bedsAgg.map((b) => [b.status, b._count._all]),
  );
  const availableBeds = bedCounts.AVAILABLE ?? 0;
  const occupiedBeds = bedCounts.OCCUPIED ?? 0;
  const totalBeds = availableBeds + occupiedBeds;

  return {
    todayCollection: todayRevenue._sum.amount ?? 0,
    todayPayments: todayRevenue._count,
    outstanding:
      (outstandingAgg._sum.totalAmount ?? 0) -
      (outstandingAgg._sum.paidAmount ?? 0),
    openInvoices: outstandingAgg._count,
    totalPatients,
    todayOpCount,
    activeAdmissionsCount,
    totalBeds,
    availableBeds,
    pendingLabCount,
    counts: {
      UNPAID: counts.UNPAID ?? 0,
      PARTIALLY_PAID: counts.PARTIALLY_PAID ?? 0,
      PAID: counts.PAID ?? 0,
      CANCELLED: counts.CANCELLED ?? 0,
    },
    recentInvoices,
    recentPatients,
    recentPayments,
  };
}

export async function getDoctorDashboardStats(doctorId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    todayAppointments,
    activeOpVisits,
    myInpatients,
    pendingLabOrders,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        doctorId,
        slot: { gte: startOfDay },
      },
      take: 8,
      orderBy: { slot: "asc" },
      include: {
        patient: {
          select: { id: true, name: true, uhid: true, phone: true, gender: true, age: true },
        },
      },
    }),
    prisma.oPVisit.findMany({
      where: {
        doctorId,
        status: { in: ["CHECK_IN", "WAITING_ROOM"] },
      },
      take: 8,
      orderBy: { createdAt: "asc" },
      include: {
        patient: {
          select: { id: true, name: true, uhid: true, phone: true, gender: true, age: true },
        },
      },
    }),
    prisma.admission.findMany({
      where: {
        OR: [{ admittingDoctorId: doctorId }, { attendingDoctorId: doctorId }],
        status: "ADMITTED",
      },
      take: 8,
      orderBy: { admissionDate: "desc" },
      include: {
        patient: {
          select: { id: true, name: true, uhid: true, gender: true, age: true },
        },
        bed: {
          select: { bedNumber: true, ward: true },
        },
      },
    }),
    prisma.labOrder.findMany({
      where: {
        orderedById: doctorId,
        status: { in: ["ORDERED", "SAMPLE_COLLECTED", "RESULT_ENTERED", "VERIFIED"] },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        patient: {
          select: { name: true, uhid: true },
        },
      },
    }),
  ]);

  return {
    todayAppointmentsCount: todayAppointments.length,
    activeOpVisitsCount: activeOpVisits.length,
    inpatientsCount: myInpatients.length,
    pendingLabsCount: pendingLabOrders.filter((l) => l.status !== "VERIFIED").length,
    todayAppointments,
    activeOpVisits,
    myInpatients,
    pendingLabOrders,
  };
}

export async function getReceptionDashboardStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    todayRegistrationsCount,
    totalPatientsCount,
    todayAppointments,
    activeOpQueueCount,
    bedsAgg,
    recentPatients,
    recentPayments,
  ] = await Promise.all([
    prisma.patient.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.patient.count(),
    prisma.appointment.findMany({
      where: { slot: { gte: startOfDay } },
      take: 8,
      orderBy: { slot: "asc" },
      include: {
        patient: { select: { id: true, name: true, uhid: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
    }),
    prisma.oPVisit.count({
      where: { status: { in: ["CHECK_IN", "WAITING_ROOM"] } },
    }),
    prisma.bed.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.patient.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        uhid: true,
        phone: true,
        gender: true,
        age: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { status: "SUCCESS" },
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        method: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceNo: true,
            patient: { select: { name: true, uhid: true } },
          },
        },
      },
    }),
  ]);

  const bedCounts = Object.fromEntries(
    bedsAgg.map((b) => [b.status, b._count._all]),
  );
  const availableBeds = bedCounts.AVAILABLE ?? 0;
  const occupiedBeds = bedCounts.OCCUPIED ?? 0;
  const totalBeds = availableBeds + occupiedBeds;

  return {
    todayRegistrationsCount,
    totalPatientsCount,
    todayAppointmentsCount: todayAppointments.length,
    activeOpQueueCount,
    totalBeds,
    availableBeds,
    todayAppointments,
    recentPatients,
    recentPayments,
  };
}

// Backward-compatible wrapper
export async function getDashboardStats() {
  return getAdminDashboardStats();
}
