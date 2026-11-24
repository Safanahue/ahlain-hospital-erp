import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Receipt, Stethoscope } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { computeStayDays, getAdmission, listAvailableBeds } from "@/modules/ip/service";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import { InvoiceStatusBadge, StatusBadge } from "@/modules/shared/components/Badges";
import AdmissionActions from "./AdmissionActions";

export const dynamic = "force-dynamic";

export default async function AdmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("ip.access");
  const permissions = await getPermissionsFor(user);
  const { id } = await params;

  const [admission, doctors, availableBeds] = await Promise.all([
    getAdmission(id),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listAvailableBeds(),
  ]);

  if (!admission) notFound();

  const days = computeStayDays(admission.admissionDate, admission.dischargeDate ?? new Date());
  const isAdmitted = admission.status === "ADMITTED";
  const canDischarge = permissions.has("ip.discharge");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ip"
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          IP admissions
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={isAdmitted ? "Admitted" : "Discharged"} tone={isAdmitted ? "success" : "neutral"} />
          <span className="rounded-md bg-page px-2 py-1 font-mono text-xs font-semibold text-navy">
            {admission.admissionNo}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{admission.patient.name}</h2>
            <p className="card-subtitle">
              {admission.patient.uhid} · {admission.patient.age} yrs ·{" "}
              {admission.patient.gender} · {admission.patient.phone}
            </p>
          </div>
          <dl className="px-5 pb-4">
            {[
              ["Blood group", admission.patient.bloodGroup ?? "—"],
              ["Address", admission.patient.address ?? "—"],
              [
                "Emergency contact",
                admission.patient.emergencyContactName
                  ? `${admission.patient.emergencyContactName} · ${admission.patient.emergencyContactPhone ?? ""}`
                  : "—",
              ],
              ["Provisional diagnosis", admission.diagnosis],
              ["Admitting doctor", admission.admittingDoctor.name],
              ["Attending doctor", admission.attendingDoctor?.name ?? "Not assigned"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0"
              >
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="max-w-[60%] text-right text-sm text-navy">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line px-5 py-3">
            <Link href={`/patients/${admission.patient.id}`} className="btn btn-secondary btn-sm">
              <Stethoscope className="h-3.5 w-3.5" aria-hidden />
              Patient record
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Stay &amp; bed allocation</h2>
            <p className="card-subtitle">
              Admitted {formatDate(admission.admissionDate)} · {days} day{days === 1 ? "" : "s"}
            </p>
          </div>
          <dl className="px-5 pb-4">
            {[
              ["Ward", admission.bed.ward],
              ["Room", admission.bed.roomNo ?? "—"],
              ["Bed", admission.bed.bedNumber],
              ["Floor", admission.bed.floor ?? "—"],
              ["Bed tariff", `${formatINR(admission.bed.dailyRatePaise)} / day`],
              [
                "Accommodation estimate",
                formatINR(admission.bed.dailyRatePaise * days),
              ],
              [
                "Discharged",
                admission.dischargeDate
                  ? `${formatDateTime(admission.dischargeDate)}${admission.dischargedBy ? ` · ${admission.dischargedBy.name}` : ""}`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0"
              >
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="text-right text-sm font-medium text-navy">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            {isAdmitted ? (
              <AdmissionActions
                admissionId={admission.id}
                doctors={doctors}
                currentDoctorId={admission.attendingDoctorId}
                beds={availableBeds}
                canDischarge={canDischarge}
              />
            ) : (
              <>
                <Link href={`/ip/${admission.id}/summary`} className="btn btn-secondary btn-sm">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Discharge summary
                </Link>
                {admission.invoice ? (
                  <Link
                    href={`/billing/invoices/${admission.invoice.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Receipt className="h-3.5 w-3.5" aria-hidden />
                    {admission.invoice.invoiceNo}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      {admission.status === "DISCHARGED" ? (
        <section className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="card-title">Discharge</h2>
              <p className="card-subtitle">
                {admission.dischargeType ?? "—"} ·{" "}
                {admission.dischargeDate ? formatDateTime(admission.dischargeDate) : "—"}
              </p>
            </div>
            {admission.invoice ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{admission.invoice.invoiceNo}</span>
                <span className="font-semibold text-navy">
                  {formatINR(admission.invoice.totalAmount)}
                </span>
                <InvoiceStatusBadge status={admission.invoice.status} />
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Final diagnosis</p>
              <p className="mt-0.5 text-sm text-navy">{admission.finalDiagnosis ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Condition at discharge</p>
              <p className="mt-0.5 text-sm text-navy">{admission.conditionAtDischarge ?? "—"}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Discharge summary</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-navy">
                {admission.dischargeSummary ?? "—"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Daily progress notes</h2>
            <p className="card-subtitle">{admission.progressNotes.length} recorded</p>
          </div>
          <div className="divide-y divide-line">
            {admission.progressNotes.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-muted-foreground">
                No progress notes yet. Add the first note from the actions above.
              </p>
            ) : (
              admission.progressNotes.map((note) => (
                <article key={note.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-navy">{note.author.name}</span>
                    <span className="text-muted-foreground">{formatDateTime(note.noteDate)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-navy">{note.note}</p>
                  {note.treatment ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-navy">Treatment:</span> {note.treatment}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Bed / ward transfers</h2>
            <p className="card-subtitle">{admission.transfers.length} movement(s)</p>
          </div>
          <div className="divide-y divide-line">
            {admission.transfers.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-muted-foreground">
                No transfers — the patient is still in the original bed.
              </p>
            ) : (
              admission.transfers.map((transfer) => (
                <article key={transfer.id} className="px-5 py-3 text-xs">
                  <p className="text-sm text-navy">
                    {transfer.fromWard} ({transfer.fromBedNumber}) → {transfer.toWard} (
                    {transfer.toBedNumber})
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {formatDateTime(transfer.transferredAt)} · {transfer.transferredBy.name}
                  </p>
                  {transfer.reason ? (
                    <p className="mt-0.5 text-muted-foreground">Reason: {transfer.reason}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {admission.nursingNotes.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Nursing observations</h2>
            <p className="card-subtitle">Latest vitals recorded by nursing staff</p>
          </div>
          <div className="divide-y divide-line">
            {admission.nursingNotes.map((note) => (
              <article key={note.id} className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-xs">
                <span className="text-muted-foreground">{formatDateTime(note.recordedAt)}</span>
                <span className="text-navy">{note.nurse.name}</span>
                {note.bloodPressure ? <span>BP {note.bloodPressure}</span> : null}
                {note.pulseRate ? <span>Pulse {note.pulseRate}</span> : null}
                {note.temperature ? <span>Temp {note.temperature}</span> : null}
                {note.spo2 ? <span>SpO₂ {note.spo2}%</span> : null}
                <span className="text-muted-foreground">{note.notes}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
