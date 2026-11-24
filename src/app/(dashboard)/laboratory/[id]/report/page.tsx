import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { getOrderReport } from "@/modules/laboratory/results";
import { resolveSignatureUrl } from "@/modules/settings/brand";
import { getHospitalSettings } from "@/modules/billing/queries";
import { formatDateTime } from "@/modules/shared/datetime";
import PrintActions from "@/modules/shared/components/PrintActions";
import {
  DocumentMeta,
  DocumentSurface,
  DocumentWatermark,
  HospitalHeader,
} from "@/modules/documents/components";

export const dynamic = "force-dynamic";

function FlagChip({ flag }: { flag: string }) {
  if (flag === "HIGH") {
    return (
      <span className="ml-2 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-danger">
        HIGH
      </span>
    );
  }
  if (flag === "LOW") {
    return (
      <span className="ml-2 rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-info">
        LOW
      </span>
    );
  }
  return null;
}

export default async function LabReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("lab.access");
  const { id } = await params;

  const [order, settings] = await Promise.all([getOrderReport(id), getHospitalSettings()]);
  if (!order) notFound();

  // Group snapshot rows by their section heading, keeping parameter order.
  const grouped = order.results.reduce<{ section: string; rows: typeof order.results }[]>(
    (groups, row) => {
      const section = row.section?.trim() || "Results";
      const existing = groups.find((group) => group.section === section);
      if (existing) existing.rows.push(row);
      else groups.push({ section, rows: [row] });
      return groups;
    },
    [],
  );

  const reportDate = order.verifiedAt ?? order.updatedAt;
  const technician = order.verifiedBy?.name ?? order.orderedBy?.name ?? "Laboratory technician";

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/laboratory"
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Laboratory
        </Link>
        <PrintActions />
      </div>

      <DocumentSurface>
        <DocumentWatermark settings={settings} />

        <div className="relative z-10">
          <HospitalHeader
            settings={settings}
            title="Laboratory Report"
            subtitle={`${order.template?.name ?? order.testName}  ·  Accession ${order.orderNo}`}
          />

          <DocumentMeta
            items={[
              { label: "Patient Name", value: order.patient.name },
              {
                label: "Age / Gender",
                value: `${order.patient.age} yrs / ${order.patient.gender.charAt(0)}${order.patient.gender
                  .slice(1)
                  .toLowerCase()}`,
              },
              { label: "UHID / SID", value: order.patient.uhid },
              { label: "Phone Number", value: order.patient.phone },
              {
                label: "Registration Date",
                value: formatDateTime(order.patient.createdAt),
              },
              { label: "Report Date & Time", value: formatDateTime(reportDate) },
              { label: "Referred By / Doctor", value: order.orderedBy?.name ?? "" },
              { label: "Sample", value: order.sampleType ?? "" },
              {
                label: "Sample Collected",
                value: order.sampleCollectedAt
                  ? formatDateTime(order.sampleCollectedAt)
                  : "",
              },
              { label: "Department", value: "Laboratory Medicine" },
              { label: "Hospital", value: settings.hospitalName },
            ]}
          />

          {/* Results table */}
        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-navy text-left text-navy">
              <th className="py-2 pr-3 font-semibold">Test Description</th>
              <th className="w-44 py-2 pr-3 font-semibold">Value Observed</th>
              <th className="w-52 py-2 font-semibold">Reference Range</th>
            </tr>
          </thead>
          <tbody>
            {order.results.length === 0 ? (
              <tr className="border-b border-line">
                <td className="py-2 pr-3 text-navy">{order.testName}</td>
                <td className="py-2 pr-3 whitespace-pre-line font-mono text-navy">
                  {order.resultValue ?? "—"}
                </td>
                <td className="py-2 text-navy">{order.referenceRange ?? "—"}</td>
              </tr>
            ) : (
              grouped.map((group) => (
                <Fragment key={group.section}>
                  <tr>
                    <td
                      colSpan={3}
                      className="bg-page/80 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-navy"
                    >
                      {group.section}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="border-b border-line align-top">
                      <td className="py-2 pr-3 text-navy">{row.parameterName}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`font-mono font-semibold ${
                            row.flag === "HIGH"
                              ? "text-danger"
                              : row.flag === "LOW"
                                ? "text-info"
                                : "text-navy"
                          }`}
                        >
                          {row.resultValue}
                          {row.unit ? ` ${row.unit}` : ""}
                        </span>
                        <FlagChip flag={row.flag} />
                      </td>
                      <td className="py-2 text-navy">{row.referenceRange ?? "—"}</td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>

        {order.findings ? (
          <section className="mt-4 rounded-md border border-line px-3 py-2 text-[11px]">
            <p className="font-semibold text-navy">Remarks</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{order.findings}</p>
          </section>
        ) : null}

        <p className="mt-4 text-[10px] leading-snug text-muted-foreground">
          Reference intervals are configured per test parameter and may vary with age, gender and
          method. Flags compare the observed value with the configured interval and are not a
          diagnosis. Please interpret this report with the clinical picture.
        </p>

          {/* Signatures */}
        <footer className="doc-signatures mt-10 grid grid-cols-2 gap-16 text-[11px]">
          <div className="border-t border-[#94a3b8] pt-2 text-center text-[#111827]">
            <p className="font-semibold">{technician}</p>
            <div className="text-[10px] text-muted-foreground">Laboratory technician</div>
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
              <p className="font-semibold">{order.verifiedBy?.name ?? ""}</p>
              <div className="text-[10px] text-muted-foreground">
                Authorised signatory
              </div>
            </div>
          </div>
        </footer>

        <p className="mt-6 border-t border-line pt-3 text-center text-[8.5px] leading-snug text-muted-foreground">
          Computer-generated report · {settings.hospitalName} · {order.orderNo}
        </p>
        </div>
      </DocumentSurface>
    </div>
  );
}
