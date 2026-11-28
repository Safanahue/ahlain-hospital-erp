import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import { listDentalEncounters } from "@/modules/dental/service";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import {
  formatDateKeyLabel,
  hospitalRange,
  isValidDateKey,
  todayKey,
} from "@/modules/shared/hospital-time";
import NewDentalEncounterForm from "./NewDentalEncounterForm";
import DentalActions from "./DentalActions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function DentalStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
    IN_PROGRESS: { label: "In Progress", tone: "warning" },
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

export default async function DentalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("dental.access");
  const sp = await searchParams;

  const fromKey = isValidDateKey(first(sp.from)) ? (first(sp.from) as string) : todayKey();
  const toKey = isValidDateKey(first(sp.to)) ? (first(sp.to) as string) : fromKey;
  const hasDateFilter = Boolean(first(sp.from) || first(sp.to));

  const [encounters, dentists, dentalServices] = await Promise.all([
    listDentalEncounters(hasDateFilter ? hospitalRange(fromKey, toKey) : undefined),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.serviceCatalog.findMany({
      where: { department: "DENTAL", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, pricePaise: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">Dental Department</h1>
          <p className="page-note">
            {encounters.length} clinical encounter{encounters.length === 1 ? "" : "s"} logged · Tooth notations & procedure billing
          </p>
        </div>
        <Link
          href="/settings/services"
          className="btn btn-secondary btn-sm"
          title="Add permanent dental procedures to Service Catalog price list"
        >
          Manage Service Catalog →
        </Link>
      </div>

      {/* Dental encounter date filter — applied server-side */}
      <form method="GET" action="/dental" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="field-label">
              Encounter date from
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
              <Link href="/dental" className="btn btn-secondary">
                Today
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {hasDateFilter ? (
              <>
                Showing encounters from{" "}
                {fromKey === toKey
                  ? formatDateKeyLabel(fromKey)
                  : `${formatDateKeyLabel(fromKey)} – ${formatDateKeyLabel(toKey)}`}
              </>
            ) : (
              <>Showing all recorded encounters</>
            )}
          </p>
        </div>
      </form>

      {/* New Dental Encounter Form */}
      <NewDentalEncounterForm
        dentists={dentists}
        catalogServices={dentalServices}
      />

      {/* Dental Case Log Table */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">Dental Procedure Log</h2>
            <p className="card-subtitle">Tooth records, diagnostic summaries, and clinical progress</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="[&_tr]:bg-page">
                <TableHead>Case No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Tooth #</TableHead>
                <TableHead className="text-right">Estimated Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {encounters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-navy">No dental procedures recorded yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Log the first dental case using the form above.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                encounters.map((enc) => (
                  <TableRow key={enc.id} className="hover:bg-page/50">
                    <TableCell className="font-semibold text-medical whitespace-nowrap">
                      {enc.dentalNo}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-navy">{enc.patient.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {enc.patient.uhid} · {enc.patient.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-navy">{enc.dentist.name}</TableCell>
                    <TableCell>
                      <div className="font-medium text-navy">{enc.procedureName}</div>
                      {enc.chiefComplaint ? (
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {enc.chiefComplaint}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-navy font-semibold">
                      {enc.toothNumber || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-navy whitespace-nowrap">
                      {formatINR(enc.costPaise)}
                    </TableCell>
                    <TableCell>
                      <DentalStatusBadge status={enc.status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <DentalActions
                        encounterId={enc.id}
                        currentStatus={enc.status}
                        patientId={enc.patientId}
                      />
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
