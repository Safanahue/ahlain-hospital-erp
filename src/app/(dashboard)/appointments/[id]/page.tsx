import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, User, Stethoscope, CheckCircle, Circle, XCircle, Calendar, AlertTriangle } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { getAppointmentWithDetails } from "@/modules/appointments/queries";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import AppointmentDetailActions from "./AppointmentDetailActions";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle; tone: "success" | "warning" | "danger" | "neutral"; actions: string[] }> = {
  SCHEDULED: { label: "Scheduled", icon: Calendar, tone: "neutral", actions: ["CHECK_IN"] },
  CHECKED_IN: { label: "Checked in", icon: CheckCircle, tone: "warning", actions: ["DONE", "NO_SHOW"] },
  DONE: { label: "Done", icon: CheckCircle, tone: "success", actions: [] },
  NO_SHOW: { label: "No-show", icon: XCircle, tone: "danger", actions: [] },
};

export default async function AppointmentDetail({ params }: Props) {
  const { id } = await params;
  const appointment = await getAppointmentWithDetails(id);
  if (!appointment) notFound();

  const user = await requirePagePermission("appointments.access");
  const meta = STATUS_META[appointment.status] ?? STATUS_META.SCHEDULED;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/appointments" className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All appointments
        </Link>
        <p className="page-note">{appointment.patient.uhid} · {appointment.patient.name}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Patient + doctor cards */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{appointment.patient.name}</h2>
            <p className="card-subtitle">{appointment.patient.uhid} · {appointment.patient.phone}</p>
          </div>
          <dl className="px-5 pb-4">
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Patient ID</dt>
              <dd className="text-sm font-medium text-navy">{appointment.patient.uhid}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Mobile</dt>
              <dd className="text-sm font-medium text-navy">{appointment.patient.phone}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Age</dt>
              <dd className="text-sm font-medium text-navy">{appointment.patient.age === 30 ? "—" : `${appointment.patient.age} years`}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Gender</dt>
              <dd className="text-sm font-medium text-navy">{appointment.patient.gender}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Doctor</dt>
              <dd className="text-sm font-medium text-navy">{appointment.doctor.name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-medium text-muted-foreground">Slot</dt>
              <dd className="text-sm font-medium text-navy">
                {formatDate(appointment.slot)} <span className="block text-xs text-muted-foreground">{formatTime(appointment.slot)}</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Status + actions */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Status</h2>
            <p className="card-subtitle">
              {appointment.status === "SCHEDULED"
                ? "Waits in the queue until the patient arrives."
                : appointment.status === "CHECKED_IN"
                  ? "Now being seen by the doctor."
                  : appointment.status === "DONE"
                    ? "Encounter completed."
                    : "Patient did not arrive."}
            </p>
          </div>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${meta.tone === "success" ? "bg-success-bg text-success" : meta.tone === "warning" ? "bg-warning-bg text-warning" : meta.tone === "danger" ? "bg-danger-bg text-danger" : "bg-muted text-muted-foreground"}`}>
              <meta.icon className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold text-navy">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{appointment.slot.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppointmentDetailActions
                appointmentId={appointment.id}
                actions={meta.actions}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
