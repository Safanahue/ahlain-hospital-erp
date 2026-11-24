import Link from "next/link";
import {
  BedDouble,
  CalendarPlus,
  FilePlus2,
  IndianRupee,
  Stethoscope,
  UserPlus,
  Users,
  Wallet,
  FlaskConical,
  Clock,
  ArrowRight,
  Calendar,
  Activity,
  CheckCircle2,
  AlertCircle,
  Receipt,
  FileText,
} from "lucide-react";
import {
  getAdminDashboardStats,
  getDoctorDashboardStats,
  getReceptionDashboardStats,
} from "@/modules/dashboard/queries";
import { formatINR } from "@/modules/shared/money";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import StatCard from "@/modules/shared/components/StatCard";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
  StatusBadge,
} from "@/modules/shared/components/Badges";
import { requirePageUser, getPermissionsFor } from "@/modules/auth/guards";
import DateWiseSection from "@/modules/dashboard/components/DateWiseSection";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const permissions = await getPermissionsFor(user);
  const sp = await searchParams;
  const dateWiseParams = {
    date: first(sp.date),
    month: first(sp.month),
    view: first(sp.view),
    kind: first(sp.kind),
    q: first(sp.q),
    page: first(sp.page),
  };

  // 1. DOCTOR DASHBOARD VIEW
  if (user.role === "DOCTOR") {
    const docStats = await getDoctorDashboardStats(user.id);

    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Stethoscope className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-navy">
                Doctor Workstation · Dr. {user.name}
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Clinical OPD consultations, active inpatient rounds, and patient diagnostics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/op" className="btn btn-primary btn-sm flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>OPD Queue</span>
            </Link>
            <Link href="/ip" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <BedDouble className="h-3.5 w-3.5" />
              <span>Ward Inpatients</span>
            </Link>
            <Link href="/appointments" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Appointments</span>
            </Link>
            <Link href="/laboratory" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" />
              <span>Lab Orders</span>
            </Link>
          </div>
        </div>

        {/* Clinical Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Appointments Today"
            value={String(docStats.todayAppointmentsCount)}
            hint="Scheduled clinic slots"
            icon={Calendar}
            accent="medical"
          />
          <StatCard
            label="Waiting Consultations"
            value={String(docStats.activeOpVisitsCount)}
            hint="OP tokens in queue"
            icon={Clock}
            accent="warning"
          />
          <StatCard
            label="Admitted Inpatients"
            value={String(docStats.inpatientsCount)}
            hint="Under your direct care"
            icon={BedDouble}
            accent="navy"
          />
          <StatCard
            label="Pending Lab Tests"
            value={String(docStats.pendingLabsCount)}
            hint="Awaiting result review"
            icon={FlaskConical}
            accent="teal"
          />
        </div>

        {/* Date-wise patient calendar & activity (doctor-scoped) */}
        <DateWiseSection params={dateWiseParams} doctorId={user.id} />

        {/* Clinical Tables Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Waiting OPD Queue */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Waiting OP Consultations</h2>
                <p className="card-subtitle">Patients ready for clinical examination</p>
              </div>
              <Link href="/op" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>View OPD</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OP Token</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Reason / Complaint</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docStats.activeOpVisits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No waiting OP patients in your queue right now.
                      </TableCell>
                    </TableRow>
                  ) : (
                    docStats.activeOpVisits.map((visit) => (
                      <TableRow key={visit.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-medical">
                          {visit.opNo}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{visit.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{visit.patient.uhid}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {visit.complaint || "Routine Consultation"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href="/op" className="btn btn-secondary btn-xs">
                            Examine
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Today's Appointments Schedule */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Today&apos;s Appointment Schedule</h2>
                <p className="card-subtitle">Scheduled consultation slots</p>
              </div>
              <Link href="/appointments" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>All Slots</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slot Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docStats.todayAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No appointments booked for today yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    docStats.todayAppointments.map((apt) => (
                      <TableRow key={apt.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-navy whitespace-nowrap">
                          {formatTime(new Date(apt.slot))}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{apt.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{apt.patient.uhid}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {apt.patient.phone || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700">
                            {apt.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>

        {/* Inpatients & Lab Results Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Admitted Inpatients */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Admitted Inpatients</h2>
                <p className="card-subtitle">Current patients in ward care</p>
              </div>
              <Link href="/ip" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>IP Module</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP No</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Bed / Ward</TableHead>
                    <TableHead className="text-right">Admitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docStats.myInpatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No admitted inpatients assigned to you.
                      </TableCell>
                    </TableRow>
                  ) : (
                    docStats.myInpatients.map((adm) => (
                      <TableRow key={adm.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-medical">
                          {adm.admissionNo}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{adm.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{adm.patient.uhid}</div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-page px-2 py-0.5 text-xs font-medium text-navy">
                            Bed {adm.bed?.bedNumber ?? "—"} ({adm.ward})
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(new Date(adm.admissionDate))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Pending Diagnostic Tests */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Laboratory Investigations</h2>
                <p className="card-subtitle">Diagnostic orders for your patients</p>
              </div>
              <Link href="/laboratory" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>Laboratory</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Accession</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Test Name</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docStats.pendingLabOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No pending laboratory tests ordered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    docStats.pendingLabOrders.map((lab) => (
                      <TableRow key={lab.id} className="hover:bg-page/50">
                        <TableCell className="font-mono text-xs font-semibold text-navy">
                          {lab.orderNo}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{lab.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{lab.patient.uhid}</div>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-navy">
                          {lab.testName}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            lab.status === "VERIFIED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}>
                            {lab.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // 2. RECEPTIONIST DASHBOARD VIEW
  if (user.role === "RECEPTION") {
    const recStats = await getReceptionDashboardStats();

    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
                <Users className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-navy">
                Reception & Front Desk · {user.name}
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Patient registrations, appointment bookings, OP tokens, and front-desk billing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patients/new" className="btn btn-primary btn-sm flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              <span>Register Patient</span>
            </Link>
            <Link href="/op" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>OP Token Queue</span>
            </Link>
            <Link href="/appointments" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>Book Appointment</span>
            </Link>
            <Link href="/billing/invoices/new" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>New Bill / Receipt</span>
            </Link>
          </div>
        </div>

        {/* Front-Desk Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Registrations Today"
            value={String(recStats.todayRegistrationsCount)}
            hint="New patients registered"
            icon={UserPlus}
            accent="teal"
          />
          <StatCard
            label="Waiting OP Queue"
            value={String(recStats.activeOpQueueCount)}
            hint="Active tokens today"
            icon={Clock}
            accent="warning"
          />
          <StatCard
            label="Today's Appointments"
            value={String(recStats.todayAppointmentsCount)}
            hint="Booked consultations"
            icon={Calendar}
            accent="medical"
          />
          <StatCard
            label="Available Beds"
            value={`${recStats.availableBeds} / ${recStats.totalBeds}`}
            hint="Inpatient bed capacity"
            icon={BedDouble}
            accent="navy"
          />
        </div>

        {/* Date-wise patient calendar & activity */}
        <DateWiseSection params={dateWiseParams} />

        {/* Front-Desk Tables Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recently Registered Patients */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Recent Patient Registrations</h2>
                <p className="card-subtitle">Newly registered patients in directory</p>
              </div>
              <Link href="/patients" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>All Patients</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UHID</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recStats.recentPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No patient registrations yet today.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recStats.recentPatients.map((p) => (
                      <TableRow key={p.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-medical">
                          {p.uhid}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.gender ? `${p.gender} · ` : ""}{p.age ? `${p.age} yrs` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.phone || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(new Date(p.createdAt))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Today's Appointments Schedule */}
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Today&apos;s Appointments</h2>
                <p className="card-subtitle">Scheduled doctor consultations</p>
              </div>
              <Link href="/appointments" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>Manage</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recStats.todayAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No appointments scheduled for today.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recStats.todayAppointments.map((apt) => (
                      <TableRow key={apt.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-navy whitespace-nowrap">
                          {formatTime(new Date(apt.slot))}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{apt.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{apt.patient.uhid}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          Dr. {apt.doctor.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700">
                            {apt.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>

        {/* Front-Desk Receipts Activity */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="card-title">Recent Payment Receipts</h2>
              <p className="card-subtitle">Front-desk receipts issued to patients</p>
            </div>
            <Link href="/billing/invoices" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
              <span>Billing Center</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recStats.recentPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      No payment receipts issued today yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recStats.recentPayments.map((pmt) => (
                    <TableRow key={pmt.id} className="hover:bg-page/50">
                      <TableCell className="font-semibold text-medical">
                        {pmt.receiptNo}
                      </TableCell>
                      <TableCell className="font-medium text-navy">
                        {pmt.invoice?.patient?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {pmt.invoice?.invoiceNo ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded bg-page px-2 py-0.5 text-xs text-navy font-medium">
                          {METHOD_LABELS[pmt.method] ?? pmt.method}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-navy">
                        {formatINR(pmt.amount)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(new Date(pmt.createdAt))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    );
  }

  // 3. ADMIN / EXECUTIVE DASHBOARD VIEW (Default for Admin & authorized executive staff)
  const stats = await getAdminDashboardStats();
  const canSeeBilling = permissions.has("billing.view");

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Activity className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-navy">
              Hospital Executive Overview · {user.name}
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete institutional control: clinical workflows, daily revenue, patient census & diagnostics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/patients/new" className="btn btn-primary btn-sm flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            <span>New Patient</span>
          </Link>
          <Link href="/op" className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" />
            <span>OP Queue</span>
          </Link>
          <Link href="/ip" className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <BedDouble className="h-3.5 w-3.5" />
            <span>IP Admission</span>
          </Link>
          <Link href="/billing/invoices/new" className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Create Bill</span>
          </Link>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Patients"
          value={String(stats.totalPatients)}
          hint="Registered directory"
          icon={Users}
          accent="navy"
        />
        {canSeeBilling ? (
          <>
            <StatCard
              label="Today's Collection"
              value={formatINR(stats.todayCollection)}
              hint={`${stats.todayPayments} payment${stats.todayPayments === 1 ? "" : "s"} collected`}
              icon={Wallet}
              accent="teal"
            />
            <StatCard
              label="Outstanding Dues"
              value={formatINR(stats.outstanding)}
              hint={`${stats.openInvoices} open invoice${stats.openInvoices === 1 ? "" : "s"}`}
              icon={IndianRupee}
              accent="danger"
            />
            <StatCard
              label="Unpaid Invoices"
              value={String(stats.counts.UNPAID)}
              hint="Awaiting payment"
              icon={FileText}
              accent="warning"
            />
          </>
        ) : null}
        <StatCard
          label="Today's OP Visits"
          value={String(stats.todayOpCount)}
          hint="Consultation tokens"
          icon={Stethoscope}
          accent="medical"
        />
        <StatCard
          label="Bed Occupancy"
          value={`${stats.totalBeds - stats.availableBeds} / ${stats.totalBeds}`}
          hint={`${stats.availableBeds} beds available`}
          icon={BedDouble}
          accent="navy"
        />
      </div>

      {/* Date-wise patient calendar & activity */}
      <DateWiseSection params={dateWiseParams} />

      {/* Recent Activity Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Invoices & Billing */}
        {canSeeBilling ? (
          <section className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="card-title">Recent Invoices</h2>
                <p className="card-subtitle">Latest hospital billing transactions</p>
              </div>
              <Link href="/billing/invoices" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
                <span>All Invoices</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No invoices recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.recentInvoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-page/50">
                        <TableCell className="font-semibold text-medical">
                          <Link href={`/billing/invoices/${inv.id}`} className="hover:underline">
                            {inv.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-navy">{inv.patient.name}</div>
                          <div className="text-xs text-muted-foreground">{inv.patient.uhid}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-navy">
                          {formatINR(inv.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        {/* Recent Patient Registrations */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="card-title">Recent Patient Registrations</h2>
              <p className="card-subtitle">Newly admitted hospital records</p>
            </div>
            <Link href="/patients" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
              <span>View Directory</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UHID</TableHead>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentPatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                      No patients registered yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.recentPatients.map((p) => (
                    <TableRow key={p.id} className="hover:bg-page/50">
                      <TableCell className="font-semibold text-medical">
                        <Link href={`/patients/${p.id}`} className="hover:underline">
                          {p.uhid}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.gender ? `${p.gender} · ` : ""}{p.age ? `${p.age} yrs` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.phone || "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(new Date(p.createdAt))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {/* Today's Collections Stream */}
      {canSeeBilling && stats.recentPayments.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="card-title">Today&apos;s Collections Stream</h2>
              <p className="card-subtitle">Real-time payment receipts across all hospital departments</p>
            </div>
            <Link href="/billing/invoices" className="text-xs font-semibold text-medical hover:underline flex items-center gap-1">
              <span>Reconcile Receipts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead className="text-right">Collected Amount</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentPayments.map((pmt) => (
                  <TableRow key={pmt.id} className="hover:bg-page/50">
                    <TableCell className="font-semibold text-medical">
                      {pmt.receiptNo}
                    </TableCell>
                    <TableCell className="font-medium text-navy">
                      {pmt.invoice?.patient?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {pmt.invoice?.invoiceNo ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded bg-page px-2 py-0.5 text-xs text-navy font-medium">
                        {METHOD_LABELS[pmt.method] ?? pmt.method}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-navy">
                      {formatINR(pmt.amount)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(new Date(pmt.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
