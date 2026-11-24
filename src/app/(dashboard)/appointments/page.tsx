import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import { listAppointments } from "@/modules/appointments/service";
import { appointmentListQuerySchema } from "@/modules/appointments/schemas";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import BookAppointmentForm from "./BookAppointmentForm";
import AppointmentActions from "./AppointmentActions";
import Pagination from "@/modules/shared/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Users,
  UserCheck,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }
  > = {
    SCHEDULED: { label: "Scheduled", tone: "info" },
    CHECKED_IN: { label: "Checked In", tone: "warning" },
    DONE: { label: "Completed", tone: "success" },
    NO_SHOW: { label: "No-Show / Cancelled", tone: "danger" },
  };
  const tone = map[status] ?? { label: status, tone: "neutral" };
  const toneClass =
    tone.tone === "success"
      ? "bg-success-bg text-success border-emerald-200"
      : tone.tone === "warning"
        ? "bg-warning-bg text-warning border-amber-200"
        : tone.tone === "danger"
          ? "bg-danger-bg text-danger border-red-200"
          : tone.tone === "info"
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-muted text-muted-foreground border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${toneClass}`}
    >
      {tone.label}
    </span>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("appointments.access");
  const sp = await searchParams;

  const currentTab = first(sp.tab) ?? "all";
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfToday = new Date(`${todayStr}T00:00:00Z`);
  const endOfToday = new Date(`${todayStr}T23:59:59Z`);

  // Map active tab to query parameters
  let tabStatus: string | undefined = undefined;
  let tabFrom: string | undefined = first(sp.from);
  let tabTo: string | undefined = first(sp.to);

  if (currentTab === "today") {
    tabFrom = todayStr;
    tabTo = todayStr;
  } else if (currentTab === "upcoming") {
    tabStatus = "SCHEDULED";
    tabFrom = todayStr;
  } else if (currentTab === "checked_in") {
    tabStatus = "CHECKED_IN";
  } else if (currentTab === "completed") {
    tabStatus = "DONE";
  } else if (currentTab === "no_show") {
    tabStatus = "NO_SHOW";
  }

  const raw = {
    page: Number(first(sp.page) ?? "1"),
    pageSize: 15,
    q: first(sp.q),
    status: tabStatus ?? first(sp.status),
    doctorId: first(sp.doctorId),
    from: tabFrom,
    to: tabTo,
  };

  const parsed = appointmentListQuerySchema.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : appointmentListQuerySchema.parse({ page: 1, pageSize: 15 });

  // Parallel fetch: Appointments, Patients, Doctors, and Live KPI statistics
  const [result, patients, doctors, totalAll, todayAll, checkedInAll, doneAll] =
    await Promise.all([
      listAppointments(query),
      prisma.patient.findMany({
        take: 100,
        orderBy: { name: "asc" },
        select: { id: true, name: true, uhid: true },
      }),
      prisma.user.findMany({
        where: { role: "DOCTOR", active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.appointment.count(),
      prisma.appointment.count({
        where: { slot: { gte: startOfToday, lte: endOfToday } },
      }),
      prisma.appointment.count({ where: { status: "CHECKED_IN" } }),
      prisma.appointment.count({ where: { status: "DONE" } }),
    ]);

  const { items, total, page, pageSize, totalPages } = result;

  const tabs = [
    { id: "all", label: "All Appointments", count: totalAll },
    { id: "today", label: "Today", count: todayAll },
    { id: "upcoming", label: "Upcoming", count: undefined },
    { id: "checked_in", label: "Checked In", count: checkedInAll },
    { id: "completed", label: "Completed", count: doneAll },
    { id: "no_show", label: "Cancelled / No-Show", count: undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-medical p-2 text-white shadow-xs">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-navy">
                Appointments & Queue
              </h1>
              <p className="page-note text-xs text-muted-foreground">
                Daily outpatient scheduling, live queue tracking, and token management
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/op"
            className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
            title="Go to Outpatient Management Queue"
          >
            <Users className="h-3.5 w-3.5 text-medical" />
            OP Consultation Queue →
          </Link>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Bookings
            </span>
            <CalendarDays className="h-4 w-4 text-medical" />
          </div>
          <p className="mt-2 text-2xl font-bold text-navy">{totalAll}</p>
          <span className="text-[11px] text-muted-foreground">
            All recorded slots
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Today&apos;s Appointments
            </span>
            <Clock className="h-4 w-4 text-teal" />
          </div>
          <p className="mt-2 text-2xl font-bold text-teal">{todayAll}</p>
          <span className="text-[11px] text-muted-foreground">
            Scheduled for today
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Checked In Queue
            </span>
            <UserCheck className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">
            {checkedInAll}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Waiting in reception
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Completed Consultations
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{doneAll}</p>
          <span className="text-[11px] text-muted-foreground">
            Finished visits
          </span>
        </div>
      </div>

      {/* Book Appointment Form Component */}
      <BookAppointmentForm patients={patients} doctors={doctors} />

      {/* Appointments Management Card */}
      <section className="card overflow-hidden border border-slate-200 shadow-xs">
        {/* Navigation Tabs Bar */}
        <div className="border-b border-slate-200 bg-slate-50/60 px-5 pt-3">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const active = currentTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/appointments?tab=${tab.id}${query.doctorId ? `&doctorId=${query.doctorId}` : ""}${query.q ? `&q=${query.q}` : ""}`}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                    active
                      ? "border-medical text-medical bg-white rounded-t-md shadow-2xs"
                      : "border-transparent text-slate-600 hover:text-navy hover:border-slate-300"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                        active
                          ? "bg-medical/10 text-medical font-bold"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-white border-b border-slate-100">
          <form
            method="GET"
            className="flex flex-wrap items-center gap-2.5 flex-1"
          >
            <input type="hidden" name="tab" value={currentTab} />

            {/* Keyword Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                name="q"
                defaultValue={query.q ?? ""}
                placeholder="Search patient, UHID, doctor…"
                className="input pl-9 py-1.5 text-xs w-full"
              />
            </div>

            {/* Doctor Filter Dropdown */}
            <select
              name="doctorId"
              defaultValue={query.doctorId ?? ""}
              className="input py-1.5 text-xs max-w-[180px]"
            >
              <option value="">All Doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {/* Specific Date Filter */}
            <input
              type="date"
              name="from"
              defaultValue={query.from ?? ""}
              className="input py-1 text-xs max-w-[145px]"
              title="Filter by appointment date"
            />

            <button
              type="submit"
              className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
            >
              <Filter className="h-3 w-3" />
              Filter
            </button>

            {(query.q || query.doctorId || query.from) && (
              <Link
                href={`/appointments?tab=${currentTab}`}
                className="text-xs text-muted-foreground hover:text-danger underline ml-1"
              >
                Reset filters
              </Link>
            )}
          </form>

          <span className="text-xs text-muted-foreground self-end lg:self-center">
            Showing <strong>{items.length}</strong> of <strong>{total}</strong>{" "}
            record{total === 1 ? "" : "s"}
          </span>
        </div>

        {/* Appointments Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-24 font-bold text-navy">
                  Token #
                </TableHead>
                <TableHead className="w-44 font-bold text-navy">
                  Date & Time Slot
                </TableHead>
                <TableHead className="font-bold text-navy">Patient</TableHead>
                <TableHead className="w-48 font-bold text-navy">
                  Doctor
                </TableHead>
                <TableHead className="w-32 font-bold text-navy">
                  Status
                </TableHead>
                <TableHead className="w-48 text-right font-bold text-navy">
                  Queue Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-navy">
                      No appointments matching this view
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                      Use the booking form above to schedule a new consultation
                      or adjust your filters.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((apt) => (
                  <TableRow
                    key={apt.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Token Number */}
                    <TableCell className="font-mono text-xs">
                      <span className="inline-flex items-center justify-center rounded-md bg-navy text-white px-2 py-0.5 font-bold shadow-2xs">
                        #{String(apt.seqNo).padStart(3, "0")}
                      </span>
                    </TableCell>

                    {/* Date & Time Slot */}
                    <TableCell className="whitespace-nowrap text-xs">
                      <div className="font-semibold text-navy">
                        {formatDate(apt.slot)}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatTime(apt.slot)}
                      </div>
                    </TableCell>

                    {/* Patient Information */}
                    <TableCell>
                      <Link
                        href={`/patients/${apt.patientId}`}
                        className="font-semibold text-xs text-navy hover:text-medical hover:underline"
                      >
                        {apt.patientName}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {apt.patientUhid} · {apt.patientPhone}
                      </div>
                    </TableCell>

                    {/* Doctor Name */}
                    <TableCell className="text-xs">
                      <div className="font-medium text-slate-800">
                        {apt.doctorName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Consultation
                      </div>
                    </TableCell>

                    {/* Status Pill */}
                    <TableCell>
                      <StatusBadge status={apt.status} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <AppointmentActions
                        appointmentId={apt.id}
                        currentStatus={apt.status}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="border-t border-slate-100 p-3 bg-slate-50/40">
            <Pagination
              basePath="/appointments"
              query={{
                tab: currentTab,
                q: query.q,
                doctorId: query.doctorId,
                from: query.from,
                to: query.to,
              }}
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
            />
          </div>
        )}
      </section>
    </div>
  );
}
