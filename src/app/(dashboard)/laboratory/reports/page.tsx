import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { listReportDocuments } from "@/modules/laboratory/documents";
import { formatDate } from "@/modules/shared/datetime";
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

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HistoricalReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("lab.access");
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const from = first(sp.from) ?? "";
  const to = first(sp.to) ?? "";
  const linkedParam = first(sp.linked);
  const linked = linkedParam === "linked" || linkedParam === "unlinked" ? linkedParam : "all";
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const result = await listReportDocuments({ q, from, to, linked, page, pageSize: 20 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/laboratory"
            className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Laboratory
          </Link>
          <h1 className="mt-2 text-xl font-bold text-navy">Historical laboratory reports</h1>
          <p className="page-note">
            {result.total} archived PDF{result.total === 1 ? "" : "s"} · files are stored in the
            database and served only to signed-in laboratory staff
          </p>
        </div>
        <a href="/api/laboratory/reports/zip" className="btn btn-primary btn-sm">
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download all (ZIP)
        </a>
      </div>

      <form method="GET" action="/laboratory/reports" className="card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Patient, UHID, report number or test"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="linked" className="field-label">
              Matching
            </label>
            <select id="linked" name="linked" defaultValue={linked} className="input w-full">
              <option value="all">All reports</option>
              <option value="linked">Matched to a patient</option>
              <option value="unlinked">Unlinked reports</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
          <Link href="/laboratory/reports" className="btn btn-secondary btn-sm">
            Clear
          </Link>
        </div>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Report number</TableHead>
                <TableHead>Report date</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">No archived reports found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reports recovered from the Xpertz archives appear here after import.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-navy">
                        <FileText className="h-3.5 w-3.5 text-medical" aria-hidden />
                        {document.filename}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{document.sourceFolder}</div>
                    </TableCell>
                    <TableCell>
                      {document.patient ? (
                        <Link
                          href={`/patients/${document.patient.id}`}
                          className="font-medium text-medical hover:underline"
                        >
                          {document.patient.name}
                          <span className="block text-[10px] text-muted-foreground">
                            {document.patient.uhid}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlinked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {document.reportNo ?? document.order?.orderNo ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {document.reportDate ? formatDate(document.reportDate) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          document.matchConfidence === "EXACT"
                            ? "bg-success-bg text-success"
                            : document.matchConfidence === "UNMATCHED"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning-bg text-warning"
                        }`}
                      >
                        {document.matchConfidence}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(document.sizeBytes / 1024).toFixed(0)} KB
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={`/api/laboratory/reports/${document.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        View
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/laboratory/reports"
          query={{
            q: q || undefined,
            from: from || undefined,
            to: to || undefined,
            linked: linked !== "all" ? linked : undefined,
          }}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
