import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import { listOpVisits } from "@/modules/op/service";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import {
  formatDateKeyLabel,
  hospitalRange,
  isValidDateKey,
  startOfHospitalDay,
  todayKey,
} from "@/modules/shared/hospital-time";
import NewOpVisitForm from "./NewOpVisitForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
    CHECK_IN: { label: "Checked In", tone: "neutral" },
    WAITING_ROOM: { label: "In Waiting Room", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
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

export default async function OpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("op.access");
  const sp = await searchParams;

  const fromKey = isValidDateKey(first(sp.from)) ? (first(sp.from) as string) : todayKey();
  const toKey = isValidDateKey(first(sp.to)) ? (first(sp.to) as string) : fromKey;
  const range = hospitalRange(fromKey, toKey);
  // Filter only when the user submits a date range; the default view must show
  // the visits that are actually stored, not just today's.
  const hasDateFilter = Boolean(first(sp.from) || first(sp.to));

  const [visits, patients, doctors] = await Promise.all([
    listOpVisits(hasDateFilter ? range : undefined),
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
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">OP Management</h1>
          <p className="page-note">
            {visits.length} visit{visits.length === 1 ? "" : "s"}{" "}
            {hasDateFilter
              ? `from ${
                  fromKey === toKey
                    ? formatDateKeyLabel(fromKey)
                    : `${formatDateKeyLabel(fromKey)} – ${formatDateKeyLabel(toKey)}`
                }`
              : "— all recorded visits"}
            {" "}· Sequential OPD queue
          </p>
        </div>
      </div>

      {/* Register new OP visit */}
      <NewOpVisitForm patients={patients} doctors={doctors} />

      {/* OP visit date filter — applied server-side */}
      <form method="GET" action="/op" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="field-label">
              OP visit date from
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
              <Link href="/op" className="btn btn-secondary">
                Today
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {/* OP Visits Table */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">OP Queue</h2>
            <p className="card-subtitle">Consultations registered in the selected date range</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {fromKey === toKey
              ? formatDateKeyLabel(fromKey)
              : `${formatDate(startOfHospitalDay(fromKey))} – ${formatDate(startOfHospitalDay(toKey))}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="[&_tr]:bg-page">
                <TableHead>OPD No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-navy">No OP visits registered today</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Register a walk-in patient encounter using the form above.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                visits.map((visit) => (
                  <TableRow key={visit.id} className="hover:bg-page/50">
                    <TableCell className="font-semibold text-medical">
                      <Link href={`/op/${visit.id}`} className="hover:underline">
                        {visit.opNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-navy">{visit.patient.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {visit.patient.uhid} · {visit.patient.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-navy">{visit.doctor.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {visit.complaint || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatTime(visit.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={visit.status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/op/${visit.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Details
                        </Link>
                        {visit.status === "COMPLETED" ? (
                          <Link
                            href={`/billing/invoices/new?patientId=${visit.patientId}&department=OP`}
                            className="btn btn-primary btn-sm"
                          >
                            Bill
                          </Link>
                        ) : null}
                      </div>
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
