import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { computeStayDays, getAdmission } from "@/modules/ip/service";
import { resolveSignatureUrl } from "@/modules/settings/brand";
import { getHospitalSettings } from "@/modules/billing/queries";
import { formatDate, formatDateTime } from "@/modules/shared/datetime";
import PrintActions from "@/modules/shared/components/PrintActions";
import {
  DocumentMeta,
  DocumentSurface,
  DocumentWatermark,
  HospitalHeader,
} from "@/modules/documents/components";

export const dynamic = "force-dynamic";

export default async function DischargeSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("ip.access");
  const { id } = await params;

  const [admission, settings] = await Promise.all([getAdmission(id), getHospitalSettings()]);
  if (!admission) notFound();

  const days = computeStayDays(admission.admissionDate, admission.dischargeDate ?? new Date());
  const doctor = admission.attendingDoctor?.name ?? admission.admittingDoctor.name;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/ip/${admission.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Admission {admission.admissionNo}
        </Link>
        <PrintActions />
      </div>

      <DocumentSurface>
        <DocumentWatermark settings={settings} />

        <div className="relative z-10">
          <HospitalHeader
            settings={settings}
            title="Discharge Summary"
            subtitle={`IP No ${admission.admissionNo}`}
          />

          <DocumentMeta
            items={[
              { label: "Patient Name", value: admission.patient.name },
              {
                label: "Age / Gender",
                value: `${admission.patient.age === 30 ? "—" : `${admission.patient.age} yrs`} / ${admission.patient.gender.charAt(0)}${admission.patient.gender
                  .slice(1)
                  .toLowerCase()}`,
              },
              { label: "UHID / SID", value: admission.patient.uhid },
              { label: "Phone Number", value: admission.patient.phone },
              {
                label: "Registration Date",
                value: formatDateTime(admission.patient.createdAt),
              },
              { label: "Admission Number", value: admission.admissionNo },
              {
                label: "Department / Visit Type",
                value: `${admission.ward} · ${admission.bed.bedNumber}`,
              },
              { label: "Admitted", value: formatDate(admission.admissionDate) },
              {
                label: "Discharged",
                value: admission.dischargeDate
                  ? formatDate(admission.dischargeDate)
                  : "",
              },
              { label: "Length of Stay", value: `${days} day${days === 1 ? "" : "s"}` },
              { label: "Treating Doctor", value: doctor },
              { label: "Hospital", value: settings.hospitalName },
            ]}
          />

        <section className="mt-4 space-y-3 text-[12px]">
          <div>
            <p className="font-semibold uppercase tracking-wide text-navy">
              Provisional diagnosis (at admission)
            </p>
            <p className="mt-1 text-navy">{admission.diagnosis}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-navy">Final diagnosis</p>
            <p className="mt-1 text-navy">{admission.finalDiagnosis ?? "—"}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-navy">Course in hospital</p>
            <p className="mt-1 whitespace-pre-line text-navy">{admission.dischargeSummary ?? "—"}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-navy">Condition at discharge</p>
            <p className="mt-1 text-navy">{admission.conditionAtDischarge ?? "—"}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-navy">Discharge type</p>
            <p className="mt-1 text-navy">{admission.dischargeType ?? "—"}</p>
          </div>
        </section>

        {admission.progressNotes.length > 0 ? (
          <section className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-navy">
              Progress notes (latest first)
            </p>
            <ul className="mt-1 space-y-1 text-[11px] text-navy">
              {admission.progressNotes.slice(0, 6).map((note) => (
                <li key={note.id} className="border-b border-line pb-1">
                  <span className="text-muted-foreground">{formatDateTime(note.noteDate)}</span> —{" "}
                  {note.note}
                  {note.treatment ? ` · Treatment: ${note.treatment}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="doc-signatures mt-10 grid grid-cols-2 gap-16 text-[11px]">
          <div className="border-t border-[#94a3b8] pt-2 text-center text-[#111827]">
            <p className="font-semibold">{doctor}</p>
            <div className="text-[10px] text-muted-foreground">Treating doctor</div>
          </div>
          <div className="text-center text-[#111827]">
            {resolveSignatureUrl(settings.signatureImageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveSignatureUrl(settings.signatureImageUrl)}
                alt=""
                className="mx-auto mb-1 h-10 w-auto max-w-[150px] object-contain"
              />
            ) : null}
            <div className="border-t border-[#94a3b8] pt-2">
              <p className="font-semibold">{admission.dischargedBy?.name ?? ""}</p>
              <div className="text-[10px] text-muted-foreground">
                Authorised signatory
              </div>
            </div>
          </div>
        </footer>

        <p className="mt-6 border-t border-line pt-3 text-center text-[8.5px] leading-snug text-muted-foreground">
          {settings.hospitalName} · {admission.admissionNo} · Generated{" "}
          {formatDateTime(new Date())}
        </p>
        </div>
      </DocumentSurface>
    </div>
  );
}
