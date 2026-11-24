import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Stethoscope, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { getOpVisit } from "@/modules/op/service";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import OpActions from "./OpActions";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CHECK_IN: { label: "Check-in", icon: CheckCircle, tone: "neutral" },
  WAITING_ROOM: { label: "Waiting room", icon: AlertTriangle, tone: "warning" },
  COMPLETED: { label: "Completed", icon: CheckCircle, tone: "success" },
  CANCELLED: { label: "Cancelled", icon: XCircle, tone: "danger" },
};

export default async function OpVisitDetail({ params }: Props) {
  const { id } = await params;
  const visit = await getOpVisit(id);
  if (!visit) notFound();

  await requirePagePermission("op.access");
  const meta = STATUS_META[visit.status] ?? STATUS_META.CHECK_IN;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/op" className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Today&apos;s visits
        </Link>
        <p className="page-note">{visit.opNo}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{visit.patient.name}</h2>
            <p className="card-subtitle">{visit.patient.uhid} · {visit.patient.phone}</p>
          </div>
          <dl className="px-5 pb-4">
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">OPD no</dt>
              <dd className="text-sm font-medium text-navy">{visit.opNo}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Doctor</dt>
              <dd className="text-sm font-medium text-navy">{visit.doctor.name}</dd>
            </div>
            {visit.nurse ? (
              <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
                <dt className="text-xs font-medium text-muted-foreground">Nurse</dt>
                <dd className="text-sm font-medium text-navy">{visit.nurse.name}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">Started</dt>
              <dd className="text-sm font-medium text-navy">{formatDate(visit.createdAt)} {formatTime(visit.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Clinical notes & Workflow</h2>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.tone === "success" ? "bg-success-bg text-success" : meta.tone === "warning" ? "bg-warning-bg text-warning" : meta.tone === "danger" ? "bg-danger-bg text-danger" : "bg-muted text-muted-foreground"}`}>
                {meta.label}
              </span>
            </div>
          </div>
          <dl className="px-5 pb-4 space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Complaint</p>
                <p className="text-sm text-navy">{visit.complaint || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Stethoscope className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Provisional diagnosis</p>
                <p className="text-sm text-navy">{visit.provisionalDiagnosis || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Treatment plan</p>
                <p className="text-sm text-navy">{visit.treatmentPlan || "—"}</p>
              </div>
            </div>
          </dl>
          <div className="flex gap-2 border-t border-line px-5 py-3">
            <OpActions
              visitId={visit.id}
              currentStatus={visit.status}
              patientId={visit.patientId}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
