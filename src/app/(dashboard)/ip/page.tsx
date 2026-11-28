import Link from "next/link";
import { Search } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { admissionListQuerySchema } from "@/modules/ip/schemas";
import {
  computeStayDays,
  getIpOverview,
  listAdmissions,
  listAvailableBeds,
  listWards,
} from "@/modules/ip/service";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import Pagination from "@/modules/shared/components/Pagination";
import NewAdmissionForm from "./NewAdmissionForm";
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "ADMITTED" ? "bg-success-bg text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {status === "ADMITTED" ? "Admitted" : "Discharged"}
    </span>
  );
}

export default async function IpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePagePermission("ip.access");
  const permissions = await getPermissionsFor(user);
  const sp = await searchParams;

  const parsed = admissionListQuerySchema.safeParse({
    page: first(sp.page) ?? "1",
    pageSize: "15",
    q: first(sp.q),
    status: first(sp.status) ?? "ALL",
    ward: first(sp.ward),
    from: first(sp.from),
    to: first(sp.to),
  });
  const query = parsed.success
    ? parsed.data
    : admissionListQuerySchema.parse({});

  const [result, overview, wards, beds, doctors] = await Promise.all([
    listAdmissions(query),
    getIpOverview(),
    listWards(),
    listAvailableBeds(),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const canManageBeds = permissions.has("ip.access");
  const canDischarge = permissions.has("ip.discharge");
  const hasFilters = Boolean(
    query.q ||
      (query.status && query.status !== "ALL") ||
      query.ward ||
      query.from ||
      query.to,
  );

  const stats = [
    { label: "Currently admitted", value: overview.admitted, hint: "Active inpatient stays" },
    { label: "Beds available", value: overview.bedsAvailable, hint: `${overview.bedsTotal} total beds` },
    { label: "Beds occupied", value: overview.bedsOccupied, hint: `${overview.bedsMaintenance} in maintenance` },
    { label: "Admitted today", value: overview.admittedToday, hint: `${overview.discharged} discharges on record` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="page-note">
          {result.total} admission{result.total === 1 ? "" : "s"}
          {hasFilters ? " matching your filters" : " on record"} · IP numbers are generated
          automatically
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canManageBeds ? (
            <Link href="/ip/beds" className="btn btn-secondary btn-sm">
              Wards, rooms &amp; beds →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy">{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <NewAdmissionForm
        doctors={doctors}
        beds={beds}
      />

      <form method="GET" action="/ip" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ""}
                placeholder="IP number, patient name, UHID, phone or bed"
                className="input w-full pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select id="status" name="status" defaultValue={query.status ?? "ALL"} className="input">
              <option value="ALL">All statuses</option>
              <option value="ADMITTED">Admitted</option>
              <option value="DISCHARGED">Discharged</option>
            </select>
          </div>

          <div>
            <label htmlFor="ward" className="field-label">
              Ward
            </label>
            <select id="ward" name="ward" defaultValue={query.ward ?? ""} className="input">
              <option value="">All wards</option>
              {wards.map((ward) => (
                <option key={ward} value={ward}>
                  {ward}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="from" className="field-label">
              Admitted from
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={query.from ?? ""}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="to" className="field-label">
              Admitted to
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={query.to ?? ""}
              className="input"
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {hasFilters ? (
              <Link href="/ip" className="btn btn-secondary">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <section className="card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP number</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Ward / room / bed</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Admitted</TableHead>
                <TableHead>Stay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">No admissions found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Admit a patient using the form above to get started."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((admission) => {
                  const days = computeStayDays(
                    admission.admissionDate,
                    admission.dischargeDate ?? new Date(),
                  );
                  return (
                    <TableRow key={admission.id}>
                      <TableCell className="whitespace-nowrap font-medium text-medical">
                        <Link href={`/ip/${admission.id}`} className="hover:underline">
                          {admission.admissionNo}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-navy">{admission.patient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {admission.patient.uhid} · {admission.patient.age === 30 ? "—" : `${admission.patient.age} yrs`} ·{" "}
                          {admission.patient.gender}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy">
                        <div className="font-medium">{admission.bed.ward}</div>
                        <div className="text-xs text-muted-foreground">
                          {admission.bed.roomNo ? `Room ${admission.bed.roomNo} · ` : ""}
                          Bed {admission.bed.bedNumber}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy">
                        {admission.attendingDoctor?.name ?? admission.admittingDoctor.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(admission.admissionDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {days} day{days === 1 ? "" : "s"}
                        <div className="text-[11px]">
                          {formatINR(admission.bed.dailyRatePaise)}/day
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={admission.status} />
                        {admission.invoice ? (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {admission.invoice.invoiceNo}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/ip/${admission.id}`} className="btn btn-secondary btn-sm">
                            View
                          </Link>
                          {admission.status === "ADMITTED" && canDischarge ? (
                            <Link
                              href={`/ip/${admission.id}/discharge`}
                              className="btn btn-primary btn-sm"
                            >
                              Discharge
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/ip"
          query={{
            q: query.q,
            status: query.status === "ALL" ? undefined : query.status,
            ward: query.ward,
            from: query.from,
            to: query.to,
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
