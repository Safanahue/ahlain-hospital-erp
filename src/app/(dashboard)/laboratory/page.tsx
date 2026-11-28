import Link from "next/link";
import { FileArchive } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { listLabOrders, listReferenceRanges, getLabStats } from "@/modules/laboratory/service";
import { listTemplates } from "@/modules/laboratory/presets";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/modules/shared/money";
import { formatDate } from "@/modules/shared/datetime";
import NewLabOrderForm from "./NewLabOrderForm";
import LabOrderActions from "./LabOrderActions";
import ReferenceRangesManager from "./ReferenceRangesManager";
import Pagination from "@/modules/shared/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "ORDERED", label: "Ordered" },
  { value: "SAMPLE_COLLECTED", label: "Sample collected" },
  { value: "RESULT_ENTERED", label: "Results entered" },
  { value: "VERIFIED", label: "Verified" },
  { value: "CANCELLED", label: "Cancelled" },
];

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

  const q = first(sp.q)?.trim() ?? "";
  const status = first(sp.status) ?? "ALL";
  const department = first(sp.department) ?? "ALL";
  const from = first(sp.from) ?? "";
  const to = first(sp.to) ?? "";
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const [result, stats, doctors, labServices, initialRanges, templates] = await Promise.all([
    listLabOrders({ q, status, department, from, to, page, pageSize: 20 }),
    getLabStats(),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.serviceCatalog.findMany({
      where: { department: "LAB", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, pricePaise: true, category: true },
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

  const carryingQuery = {
    q: q || undefined,
    status: status !== "ALL" ? status : undefined,
    department: department !== "ALL" ? department : undefined,
    from: from || undefined,
    to: to || undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">Laboratory Module</h1>
          <p className="page-note">
            {stats.total} accession{stats.total === 1 ? "" : "s"} on record · sample tracking,
            preset-based results entry, printable reports and archived PDFs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/laboratory/reports" className="btn btn-secondary btn-sm">
            <FileArchive className="h-3.5 w-3.5" aria-hidden />
            Historical reports
          </Link>
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total accessions", value: stats.total },
          { label: "Awaiting sample", value: stats.ordered },
          { label: "In progress", value: stats.collected },
          { label: "Results entered", value: stats.resultEntered },
          { label: "Verified reports", value: stats.verified },
          { label: "Unpaid lab bills", value: stats.pendingBilling },
        ].map((card) => (
          <div key={card.label} className="card px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-bold text-navy">{card.value}</p>
          </div>
        ))}
      </div>

      <NewLabOrderForm
        doctors={doctors}
        catalogServices={labServices.map((service) => ({
          id: service.id,
          name: service.name,
          code: service.code,
          pricePaise: service.pricePaise,
          category: service.category,
        }))}
      />

      {/* Filters — empty by default so historical orders are always visible */}
      <form method="GET" action="/laboratory" className="card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Patient name, UHID, phone, accession or test"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="input w-full">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="field-label">
              From
            </label>
            <input id="from" type="date" name="from" defaultValue={from} className="input w-full" />
          </div>
          <div>
            <label htmlFor="to" className="field-label">
              To
            </label>
            <input id="to" type="date" name="to" defaultValue={to} className="input w-full" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm">
            Apply filters
          </button>
          <Link href="/laboratory" className="btn btn-secondary btn-sm">
            Clear
          </Link>
          <span className="text-xs text-muted-foreground">
            No date filter means every historical accession is listed.
          </span>
        </div>
      </form>

      <ReferenceRangesManager
        services={labServices.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        initialRanges={initialRanges}
        canManage={canManageRefRanges}
      />

      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">Diagnostic Test Queue</h2>
            <p className="card-subtitle">
              Active sample collection, laboratory analysis and final reports
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
                <TableHead>Tests / Specimen</TableHead>
                <TableHead>Readings &amp; Findings</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Tariff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Workflow Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-navy">No laboratory orders match these filters</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clear the filters to see all historical accessions, or register a new test above.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((order) => {
                  const high = order.results.filter((row) => row.flag === "HIGH").length;
                  const low = order.results.filter((row) => row.flag === "LOW").length;
                  return (
                    <TableRow key={order.id} className="hover:bg-page/50">
                      <TableCell className="whitespace-nowrap font-semibold text-medical">
                        <Link href={`/laboratory/${order.id}/report`} className="hover:underline">
                          {order.orderNo}
                        </Link>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">{order.patient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.patient.uhid} · {order.patient.age} yrs · {order.patient.gender}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy">{order.orderedBy.name}</TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">
                          {order.tests.length > 1
                            ? `${order.tests.length} tests`
                            : (order.tests[0]?.testName ?? order.testName)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.tests.length > 1
                            ? order.tests.map((test) => test.testName).join(", ")
                            : order.testName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {[order.department, order.sampleType, order.sampleId ? `Sample ${order.sampleId}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {order.results.length > 0 ? (
                          <div className="space-y-0.5">
                            {order.results.slice(0, 3).map((row) => (
                              <div key={row.id} className="flex items-baseline gap-1 text-[11px]">
                                <span className="truncate text-muted-foreground">{row.parameterName}</span>
                                <span className="font-mono font-medium text-navy">
                                  {row.resultValue}
                                  {row.unit ? ` ${row.unit}` : ""}
                                </span>
                              </div>
                            ))}
                            {order.results.length > 3 ? (
                              <div className="text-[10px] text-muted-foreground">
                                +{order.results.length - 3} more parameters
                              </div>
                            ) : null}
                          </div>
                        ) : order.resultValue ? (
                          <div className="truncate font-mono text-xs font-medium text-navy">
                            {order.resultValue}
                          </div>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">Awaiting analysis</span>
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
                      <TableCell className="whitespace-nowrap text-xs">
                        {order.invoice ? (
                          <Link
                            href={`/billing/invoices/${order.invoice.id}`}
                            className="font-medium text-medical hover:underline"
                          >
                            {order.invoice.invoiceNo}
                            <span className="block text-[10px] text-muted-foreground">
                              {order.invoice.status}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium text-navy">
                        {formatINR(order.costPaise)}
                      </TableCell>
                      <TableCell>
                        <LabStatusBadge status={order.status} />
                        {order.priority !== "ROUTINE" ? (
                          <span className="mt-1 block text-[10px] font-semibold text-danger">
                            {order.priority}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <LabOrderActions
                          orderId={order.id}
                          currentStatus={order.status}
                          patientId={order.patientId}
                          patientAge={order.patient.age}
                          patientGender={order.patient.gender}
                          testName={order.tests[0]?.testName ?? order.testName}
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

        <Pagination
          basePath="/laboratory"
          query={carryingQuery}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
