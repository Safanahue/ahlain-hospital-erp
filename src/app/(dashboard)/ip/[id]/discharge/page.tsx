import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { computeStayDays, getAdmission } from "@/modules/ip/service";
import { formatDate } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import DischargeForm from "./DischargeForm";

export const dynamic = "force-dynamic";

export default async function DischargePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("ip.discharge");
  const { id } = await params;

  const admission = await getAdmission(id);
  if (!admission) notFound();
  if (admission.status === "DISCHARGED") redirect(`/ip/${admission.id}`);

  const days = computeStayDays(admission.admissionDate, new Date());
  const roomChargePaise = admission.bed.dailyRatePaise * days;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/ip/${admission.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Admission {admission.admissionNo}
        </Link>
        <p className="page-note">
          {admission.patient.name} · {admission.patient.uhid} · {admission.bed.ward}{" "}
          {admission.bed.bedNumber}
        </p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h1 className="text-lg font-bold text-navy">Discharge &amp; final bill</h1>
          <p className="page-note">
            Admitted {formatDate(admission.admissionDate)} · {days} billed day
            {days === 1 ? "" : "s"} · room estimate {formatINR(roomChargePaise)}
          </p>
        </div>
      </div>

      <DischargeForm
        admissionId={admission.id}
        patientName={admission.patient.name}
        patientUhid={admission.patient.uhid}
        admissionNo={admission.admissionNo}
        ward={admission.bed.ward}
        bedNumber={admission.bed.bedNumber}
        roomNo={admission.bed.roomNo}
        days={days}
        dailyRatePaise={admission.bed.dailyRatePaise}
        roomChargePaise={roomChargePaise}
        defaultDiagnosis={admission.diagnosis}
      />
    </div>
  );
}
