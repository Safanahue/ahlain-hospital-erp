import Link from "next/link";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { listLabOrders, listReferenceRanges } from "@/modules/laboratory/service";
import { listTemplates } from "@/modules/laboratory/presets";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/modules/shared/money";
import {
  formatDateKeyLabel,
  hospitalRange,
  isValidDateKey,
  todayKey,
} from "@/modules/shared/hospital-time";
import NewLabOrderForm from "./NewLabOrderForm";
import LabOrderActions from "./LabOrderActions";
import ReferenceRangesManager from "./ReferenceRangesManager";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function LabStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
    ORDERED: { label: "Ordered", tone: "neutral" },
    SAMPLE_COLLECTED: { label: "Sample Collected", tone: "warning" },
    RESULT_ENTERED: { label: "Results Entered", tone: "warning" },
    VERIFIED: { label: "Verified & Ready", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
  };
  const tone = map[status] ?? { label: status, tone: "neutral" };
  const toneClass =
    tone.tone === "success"
      ? "bg-success-bg text-success"
      : tone.tone === "warning"
        ? "bg-warning-bg text-warning"
        : tone.tone === "danger"
          ? "bg-danger-bg text-danger"
          : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass}`}>
      {tone.label}
    </span>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LaboratoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePagePermission("lab.access");
  const permissions = await getPermissionsFor(user);
  const sp = await searchParams;

  const fromKey = isValidDateKey(first(sp.from)) ? (first(sp.from) as string) : todayKey();
  const toKey = isValidDateKey(first(sp.to)) ? (first(sp.to) as string) : fromKey;
  const hasDateFilter = Boolean(first(sp.from) || first(sp.to));

  const [orders, patients, doctors, labServices, initialRanges, templates] = await Promise.all([
    listLabOrders(hospitalRange(fromKey, toKey)),
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
    prisma.serviceCatalog.findMany({
      where: { department: "LAB", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, pricePaise: true },
    }),
    listReferenceRanges(),
    listTemplates(),
  ]);

  const canManageRefRanges = permissions.has("lab.masters");
  const canManagePresets = permissions.has("lab.masters");

  const resultTemplates = templates.map((template) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    parameters: template.parameters.map((parameter) => ({
      id: parameter.id,
      section: parameter.section,
      name: parameter.name,
      unit: parameter.unit,
      dataType: parameter.dataType as "NUMERIC" | "TEXT",
      sortOrder: parameter.sortOrder,
      ranges: parameter.ranges.map((range) => ({
        gender: range.gender,
        ageMinYears: range.ageMinYears,
        ageMaxYears: range.ageMaxYears,
        minValue: range.minValue,
        maxValue: range.maxValue,
        displayRange: range.displayRange,
        notes: range.notes,
      })),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">Laboratory Module</h1>
          <p className="page-note">
            {orders.length} diagnostic investigation{orders.length === 1 ? "" : "s"} from{" "}
            {fromKey === toKey
              ? formatDateKeyLabel(fromKey)
              : `${formatDateKeyLabel(fromKey)} – ${formatDateKeyLabel(toKey)}`}
            {" "}· Sample tracking,
            preset-based results entry &amp; printable reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManagePresets ? (
            <Link href="/laboratory/presets" className="btn btn-secondary btn-sm">
              Report presets &amp; ranges →
            </Link>
          ) : null}
          <Link
            href="/settings/services"
            className="btn btn-secondary btn-sm"
            title="Add lab test packages to Service Catalog"
          >
            Lab price list →
          </Link>
        </div>
      </div>

      {/* New Lab Order Requisition Form */}
      <NewLabOrderForm patients={patients} doctors={doctors} catalogServices={labServices} />

      {/* Lab order date filter — applied server-side */}
      <form method="GET" action="/laboratory" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="field-label">
              Lab order date from
            </label>
            <input id="from" type="date" name="from" defaultValue={fromKey} className="input" />
          </div>
          <div>
            <label htmlFor="to" className="field-label">
              To
            </label>
            <input id="to" type="date" name="to" defaultValue={toKey} className="input" />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply date filter
            </button>
            {hasDateFilter ? (
              <Link href="/laboratory" className="btn btn-secondary">
                Today
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {/* Reference Ranges Management (Editable List) */}
      <ReferenceRangesManager
        services={labServices.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        initialRanges={initialRanges}
        canManage={canManageRefRanges}
      />

      {/* Lab Requisitions & Queue Table */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">Diagnostic Test Queue</h2>
            <p className="card-subtitle">
              Active sample collection, laboratory analysis, and final reports
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="[&_tr]:bg-page">
                <TableHead>Accession No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Test / Specimen</TableHead>
                <TableHead>Readings &amp; Findings</TableHead>
                <TableHead className="text-right">Tariff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Workflow Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-navy">No laboratory orders recorded yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create the first diagnostic test requisition using the form above.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const high = order.results.filter((row) => row.flag === "HIGH").length;
                  const low = order.results.filter((row) => row.flag === "LOW").length;
                  return (
                    <TableRow key={order.id} className="hover:bg-page/50">
                      <TableCell className="font-semibold text-medical whitespace-nowrap">
                        {order.orderNo}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">{order.patient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.patient.uhid} · {order.patient.age} yrs · {order.patient.gender}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy">{order.orderedBy.name}</TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">{order.testName}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.template ? `Preset: ${order.template.name}` : null}
                          {order.sampleType ? ` · Sample: ${order.sampleType}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {order.results.length > 0 ? (
                          <div className="space-y-0.5">
                            {order.results.slice(0, 3).map((row) => (
                              <div key={row.id} className="flex items-baseline gap-1 text-[11px]">
                                <span className="truncate text-muted-foreground">
                                  {row.parameterName}
                                </span>
                                <span className="font-mono font-medium text-navy">
                                  {row.resultValue}
                                  {row.unit ? ` ${row.unit}` : ""}
                                </span>
                                {row.flag === "HIGH" ? (
                                  <span className="rounded bg-danger-bg px-1 text-[9px] font-bold text-danger">
                                    H
                                  </span>
                                ) : row.flag === "LOW" ? (
                                  <span className="rounded bg-info-bg px-1 text-[9px] font-bold text-info">
                                    L
                                  </span>
                                ) : null}
                              </div>
                            ))}
                            {order.results.length > 3 ? (
                              <div className="text-[10px] text-muted-foreground">
                                +{order.results.length - 3} more parameters
                              </div>
                            ) : null}
                          </div>
                        ) : order.resultValue ? (
                          <div className="truncate text-xs font-mono font-medium text-navy">
                            {order.resultValue}
                          </div>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">
                            Awaiting analysis
                          </span>
                        )}
                        {high > 0 || low > 0 ? (
                          <div className="mt-1 flex gap-1 text-[10px]">
                            {high > 0 ? (
                              <span className="rounded bg-danger-bg px-1.5 py-0.5 font-semibold text-danger">
                                {high} high
                              </span>
                            ) : null}
                            {low > 0 ? (
                              <span className="rounded bg-info-bg px-1.5 py-0.5 font-semibold text-info">
                                {low} low
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-medium text-navy whitespace-nowrap">
                        {formatINR(order.costPaise)}
                      </TableCell>
                      <TableCell>
                        <LabStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <LabOrderActions
                          orderId={order.id}
                          currentStatus={order.status}
                          patientId={order.patientId}
                          patientAge={order.patient.age}
                          patientGender={order.patient.gender}
                          testName={order.testName}
                          templates={resultTemplates}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
