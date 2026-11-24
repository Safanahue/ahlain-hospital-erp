import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hospitalRange,
  localDateKey,
  monthRangeDays,
} from "@/modules/shared/hospital-time";

export type ActivityKind =
  | "all"
  | "registration"
  | "op"
  | "ip"
  | "appointment"
  | "lab"
  | "billing"
  | "discharge";

export type ActivityKindName = Exclude<ActivityKind, "all">;

export const ACTIVITY_KIND_OPTIONS: { value: ActivityKind; label: string; short: string }[] = [
  { value: "all", label: "All activity", short: "All" },
  { value: "registration", label: "Patient registrations", short: "Registered" },
  { value: "op", label: "OP visits", short: "OP" },
  { value: "ip", label: "IP admissions", short: "IP" },
  { value: "appointment", label: "Appointments", short: "Appointments" },
  { value: "lab", label: "Lab orders", short: "Lab" },
  { value: "billing", label: "Billing", short: "Billing" },
  { value: "discharge", label: "Discharges", short: "Discharged" },
];

export type ActivityRow = {
  key: string;
  kind: ActivityKindName;
  patientId: string;
  uhid: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  opIp: "OP" | "IP" | "—";
  at: Date;
  department: string | null;
  doctor: string | null;
  status: string;
  reference: string;
  href: string;
};

type Filters = {
  from: string;
  to: string;
  q?: string;
  doctorId?: string;
};

const patientSelect = {
  id: true,
  uhid: true,
  name: true,
  phone: true,
  age: true,
  gender: true,
} satisfies Prisma.PatientSelect;

function patientSearch(q?: string): Prisma.PatientWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { uhid: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
    ],
  };
}

/** Doctor scoping for admission rows (admitting or attending). */
function admissionDoctorFilter(doctorId?: string): Prisma.AdmissionWhereInput {
  if (!doctorId) return {};
  return { OR: [{ admittingDoctorId: doctorId }, { attendingDoctorId: doctorId }] };
}

function combine(...parts: Prisma.AdmissionWhereInput[]): Prisma.AdmissionWhereInput {
  const and = parts.filter((part) => Object.keys(part).length > 0);
  return and.length ? { AND: and } : {};
}

async function loadRegistration(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const patients = await prisma.patient.findMany({
    where: { createdAt: range, ...(ps ?? {}) },
    select: { ...patientSelect, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return patients.map((p) => ({
    key: `registration:${p.id}`,
    kind: "registration",
    patientId: p.id,
    uhid: p.uhid,
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    opIp: "OP",
    at: p.createdAt,
    department: "Front desk",
    doctor: null,
    status: "REGISTERED",
    reference: p.uhid,
    href: `/patients/${p.id}`,
  }));
}

async function loadOp(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const visits = await prisma.oPVisit.findMany({
    where: {
      createdAt: range,
      ...(f.doctorId ? { doctorId: f.doctorId } : {}),
      ...(ps ? { patient: ps } : {}),
    },
    select: {
      id: true,
      opNo: true,
      status: true,
      createdAt: true,
      patient: { select: patientSelect },
      doctor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return visits.map((v) => ({
    key: `op:${v.id}`,
    kind: "op",
    patientId: v.patient.id,
    uhid: v.patient.uhid,
    name: v.patient.name,
    age: v.patient.age,
    gender: v.patient.gender,
    phone: v.patient.phone,
    opIp: "OP",
    at: v.createdAt,
    department: "Outpatient (OP)",
    doctor: v.doctor?.name ?? null,
    status: v.status,
    reference: v.opNo,
    href: `/op/${v.id}`,
  }));
}

async function loadIp(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const admissions = await prisma.admission.findMany({
    where: combine(
      { admissionDate: range },
      admissionDoctorFilter(f.doctorId),
      ps ? { patient: ps } : {},
    ),
    select: {
      id: true,
      admissionNo: true,
      status: true,
      admissionDate: true,
      ward: true,
      patient: { select: patientSelect },
      bed: { select: { bedNumber: true } },
      admittingDoctor: { select: { name: true } },
      attendingDoctor: { select: { name: true } },
    },
    orderBy: { admissionDate: "desc" },
    take: 2000,
  });
  return admissions.map((a) => ({
    key: `ip:${a.id}`,
    kind: "ip",
    patientId: a.patient.id,
    uhid: a.patient.uhid,
    name: a.patient.name,
    age: a.patient.age,
    gender: a.patient.gender,
    phone: a.patient.phone,
    opIp: "IP",
    at: a.admissionDate,
    department: `Inpatient · ${a.ward}${a.bed?.bedNumber ? ` / Bed ${a.bed.bedNumber}` : ""}`,
    doctor: a.attendingDoctor?.name ?? a.admittingDoctor?.name ?? null,
    status: a.status,
    reference: a.admissionNo,
    href: `/ip/${a.id}`,
  }));
}

async function loadAppointments(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const appointments = await prisma.appointment.findMany({
    where: {
      slot: range,
      ...(f.doctorId ? { doctorId: f.doctorId } : {}),
      ...(ps ? { patient: ps } : {}),
    },
    select: {
      id: true,
      slot: true,
      status: true,
      seqNo: true,
      patient: { select: patientSelect },
      doctor: { select: { name: true } },
    },
    orderBy: { slot: "asc" },
    take: 2000,
  });
  return appointments.map((a) => ({
    key: `appointment:${a.id}`,
    kind: "appointment",
    patientId: a.patient.id,
    uhid: a.patient.uhid,
    name: a.patient.name,
    age: a.patient.age,
    gender: a.patient.gender,
    phone: a.patient.phone,
    opIp: "OP",
    at: a.slot,
    department: "Appointment",
    doctor: a.doctor?.name ?? null,
    status: a.status,
    reference: `Token ${String(a.seqNo).padStart(3, "0")}`,
    href: `/appointments/${a.id}`,
  }));
}

async function loadLab(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const orders = await prisma.labOrder.findMany({
    where: {
      createdAt: range,
      ...(f.doctorId ? { orderedById: f.doctorId } : {}),
      ...(ps ? { patient: ps } : {}),
    },
    select: {
      id: true,
      orderNo: true,
      testName: true,
      status: true,
      createdAt: true,
      patient: { select: patientSelect },
      orderedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return orders.map((o) => ({
    key: `lab:${o.id}`,
    kind: "lab",
    patientId: o.patient.id,
    uhid: o.patient.uhid,
    name: o.patient.name,
    age: o.patient.age,
    gender: o.patient.gender,
    phone: o.patient.phone,
    opIp: "OP",
    at: o.createdAt,
    department: `Laboratory · ${o.testName}`,
    doctor: o.orderedBy?.name ?? null,
    status: o.status,
    reference: o.orderNo,
    href: `/laboratory/${o.id}/report`,
  }));
}

async function loadBilling(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const invoices = await prisma.invoice.findMany({
    where: { createdAt: range, ...(ps ? { patient: ps } : {}) },
    select: {
      id: true,
      invoiceNo: true,
      department: true,
      status: true,
      totalAmount: true,
      createdAt: true,
      patient: { select: patientSelect },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return invoices.map((i) => ({
    key: `billing:${i.id}`,
    kind: "billing",
    patientId: i.patient.id,
    uhid: i.patient.uhid,
    name: i.patient.name,
    age: i.patient.age,
    gender: i.patient.gender,
    phone: i.patient.phone,
    opIp: i.department === "IP" ? "IP" : "OP",
    at: i.createdAt,
    department: `Billing · ${i.department}`,
    doctor: null,
    status: i.status,
    reference: i.invoiceNo,
    href: `/billing/invoices/${i.id}`,
  }));
}

async function loadDischarge(f: Filters): Promise<ActivityRow[]> {
  const range = hospitalRange(f.from, f.to);
  const ps = patientSearch(f.q);
  const admissions = await prisma.admission.findMany({
    where: combine(
      { dischargeDate: range, status: "DISCHARGED" },
      admissionDoctorFilter(f.doctorId),
      ps ? { patient: ps } : {},
    ),
    select: {
      id: true,
      admissionNo: true,
      dischargeDate: true,
      ward: true,
      patient: { select: patientSelect },
      bed: { select: { bedNumber: true } },
      admittingDoctor: { select: { name: true } },
      attendingDoctor: { select: { name: true } },
    },
    orderBy: { dischargeDate: "desc" },
    take: 2000,
  });
  return admissions.map((a) => ({
    key: `discharge:${a.id}`,
    kind: "discharge",
    patientId: a.patient.id,
    uhid: a.patient.uhid,
    name: a.patient.name,
    age: a.patient.age,
    gender: a.patient.gender,
    phone: a.patient.phone,
    opIp: "IP",
    at: a.dischargeDate ?? new Date(),
    department: `Discharge · ${a.ward}${a.bed?.bedNumber ? ` / Bed ${a.bed.bedNumber}` : ""}`,
    doctor: a.attendingDoctor?.name ?? a.admittingDoctor?.name ?? null,
    status: "DISCHARGED",
    reference: a.admissionNo,
    href: `/ip/${a.id}`,
  }));
}

const LOADERS: Record<ActivityKindName, (f: Filters) => Promise<ActivityRow[]>> = {
  registration: loadRegistration,
  op: loadOp,
  ip: loadIp,
  appointment: loadAppointments,
  lab: loadLab,
  billing: loadBilling,
  discharge: loadDischarge,
};

/** Exact record counts per activity kind for the selected hospital date range. */
export async function getRangeKindCounts(
  filters: Filters,
): Promise<Record<ActivityKindName, number>> {
  const range = hospitalRange(filters.from, filters.to);
  const ps = patientSearch(filters.q);
  const cases: Prisma.AdmissionWhereInput = combine(
    {},
    admissionDoctorFilter(filters.doctorId),
    ps ? { patient: ps } : {},
  );

  const [
    registration,
    op,
    ip,
    appointment,
    lab,
    billing,
    discharge,
  ] = await Promise.all([
    prisma.patient.count({ where: { createdAt: range, ...(ps ?? {}) } }),
    prisma.oPVisit.count({
      where: {
        createdAt: range,
        ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
        ...(ps ? { patient: ps } : {}),
      },
    }),
    prisma.admission.count({ where: combine({ admissionDate: range }, cases) }),
    prisma.appointment.count({
      where: {
        slot: range,
        ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
        ...(ps ? { patient: ps } : {}),
      },
    }),
    prisma.labOrder.count({
      where: {
        createdAt: range,
        ...(filters.doctorId ? { orderedById: filters.doctorId } : {}),
        ...(ps ? { patient: ps } : {}),
      },
    }),
    prisma.invoice.count({ where: { createdAt: range, ...(ps ? { patient: ps } : {}) } }),
    prisma.admission.count({
      where: combine({ dischargeDate: range, status: "DISCHARGED" }, cases),
    }),
  ]);

  return { registration, op, ip, appointment, lab, billing, discharge };
}

/** Paginated, merged activity rows for the selected date range and kind. */
export async function getDateWiseActivities(
  filters: Filters & { kind: ActivityKind; page: number; pageSize: number },
): Promise<{ rows: ActivityRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { kind, page, pageSize } = filters;
  const kinds: ActivityKindName[] =
    kind === "all"
      ? (Object.keys(LOADERS) as ActivityKindName[])
      : [kind];

  // Fetch enough rows per kind to cover the requested page after merging.
  const perKindTake = Math.max(200, page * pageSize);
  const batches = await Promise.all(
    kinds.map(async (k) => {
      const rows = await LOADERS[k](filters);
      return rows.slice(0, perKindTake);
    }),
  );

  const merged = batches.flat().sort((a, b) => b.at.getTime() - a.at.getTime());
  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = merged.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { rows, total, page: safePage, pageSize, totalPages };
}

export type DayCounts = {
  total: number;
  registration: number;
  op: number;
  ip: number;
  appointment: number;
  lab: number;
  billing: number;
  discharge: number;
};

/** Per-hospital-day event counts for one calendar month. */
export async function getCalendarCounts({
  month,
  doctorId,
}: {
  month: string;
  doctorId?: string;
}): Promise<Record<string, DayCounts>> {
  const { from, to } = monthRangeDays(month);
  const range = hospitalRange(from, to);
  const admissionWhere: Prisma.AdmissionWhereInput = doctorId
    ? { OR: [{ admittingDoctorId: doctorId }, { attendingDoctorId: doctorId }] }
    : {};

  const [registrations, opVisits, admissions, appointments, labs, invoices, discharges] =
    await Promise.all([
      prisma.patient.findMany({
        where: { createdAt: range },
        select: { createdAt: true },
      }),
      prisma.oPVisit.findMany({
        where: { createdAt: range, ...(doctorId ? { doctorId } : {}) },
        select: { createdAt: true },
      }),
      prisma.admission.findMany({
        where: { admissionDate: range, ...admissionWhere },
        select: { admissionDate: true },
      }),
      prisma.appointment.findMany({
        where: { slot: range, ...(doctorId ? { doctorId } : {}) },
        select: { slot: true },
      }),
      prisma.labOrder.findMany({
        where: { createdAt: range, ...(doctorId ? { orderedById: doctorId } : {}) },
        select: { createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { createdAt: range },
        select: { createdAt: true },
      }),
      prisma.admission.findMany({
        where: { dischargeDate: range, status: "DISCHARGED", ...admissionWhere },
        select: { dischargeDate: true },
      }),
    ]);

  const counts: Record<string, DayCounts> = {};
  const bump = (date: Date | null, field: keyof Omit<DayCounts, "total">) => {
    if (!date) return;
    const key = localDateKey(date);
    const row =
      counts[key] ??
      (counts[key] = {
        total: 0,
        registration: 0,
        op: 0,
        ip: 0,
        appointment: 0,
        lab: 0,
        billing: 0,
        discharge: 0,
      });
    row[field] += 1;
    row.total += 1;
  };

  registrations.forEach((r) => bump(r.createdAt, "registration"));
  opVisits.forEach((r) => bump(r.createdAt, "op"));
  admissions.forEach((r) => bump(r.admissionDate, "ip"));
  appointments.forEach((r) => bump(r.slot, "appointment"));
  labs.forEach((r) => bump(r.createdAt, "lab"));
  invoices.forEach((r) => bump(r.createdAt, "billing"));
  discharges.forEach((r) => bump(r.dischargeDate, "discharge"));

  return counts;
}
