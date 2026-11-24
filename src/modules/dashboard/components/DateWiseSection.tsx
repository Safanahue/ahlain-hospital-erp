import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Search,
  UserRound,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/modules/shared/components/Pagination";
import {
  addDays,
  formatDateKeyLabel,
  formatHospitalTime,
  formatMonthLabel,
  isValidDateKey,
  isValidMonthKey,
  localDateKey,
  monthKeyOf,
  monthRangeDays,
  shiftMonth,
  todayKey,
  weekRangeDays,
} from "@/modules/shared/hospital-time";
import {
  ACTIVITY_KIND_OPTIONS,
  type ActivityKind,
  type ActivityRow,
  getCalendarCounts,
  getDateWiseActivities,
  getRangeKindCounts,
} from "../date-activity";
import ActivityCalendar from "./ActivityCalendar";

type SearchParams = {
  date?: string;
  month?: string;
  view?: string;
  kind?: string;
  q?: string;
  page?: string;
};

type ViewMode = "day" | "week" | "month";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

function buildRange(date: string, month: string, view: ViewMode) {
  if (view === "month") return monthRangeDays(month);
  if (view === "week") return weekRangeDays(date);
  return { from: date, to: date };
}

function rangeLabel(from: string, to: string): string {
  if (from === to) return formatDateKeyLabel(from);
  return `${formatDateKeyLabel(from)} – ${formatDateKeyLabel(to)}`;
}

function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "DONE":
    case "PAID":
    case "VERIFIED":
    case "DISPENSED":
    case "DISCHARGED":
      return "bg-success-bg text-success";
    case "CANCELLED":
    case "NO_SHOW":
    case "FAILED":
      return "bg-danger-bg text-danger";
    case "CHECK_IN":
    case "CHECKED_IN":
    case "WAITING_ROOM":
    case "UNPAID":
    case "PARTIALLY_PAID":
    case "ORDERED":
    case "SAMPLE_COLLECTED":
    case "RESULT_ENTERED":
    case "ADMITTED":
      return "bg-warning-bg text-warning";
    default:
      return "bg-info-bg text-info";
  }
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function kindLabel(kind: string): string {
  return (
    ACTIVITY_KIND_OPTIONS.find((option) => option.value === kind)?.short ?? kind
  );
}

export default async function DateWiseSection({
  params,
  doctorId,
}: {
  params: SearchParams;
  doctorId?: string;
}) {
  const today = todayKey();
  const date = isValidDateKey(params.date) ? params.date : today;
  const month = isValidMonthKey(params.month) ? params.month : monthKeyOf(date);
  const view: ViewMode =
    params.view === "week" || params.view === "month" ? params.view : "day";
  const kind: ActivityKind = ACTIVITY_KIND_OPTIONS.some(
    (option) => option.value === params.kind,
  )
    ? (params.kind as ActivityKind)
    : "all";
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 20;

  const { from, to } = buildRange(date, month, view);

  const [calendarCounts, kindCounts, result] = await Promise.all([
    getCalendarCounts({ month, doctorId }),
    getRangeKindCounts({ from, to, q, doctorId }),
    getDateWiseActivities({ from, to, kind, q, doctorId, page, pageSize }),
  ]);

  const calendarTotals = Object.fromEntries(
    Object.entries(calendarCounts).map(([key, value]) => [key, value.total]),
  );
  const allCount = Object.values(kindCounts).reduce((sum, value) => sum + value, 0);

  const navHref = (nextDate: string, nextMonth?: string) => {
    const search = new URLSearchParams();
    search.set("date", nextDate);
    search.set("month", nextMonth ?? monthKeyOf(nextDate));
    if (view !== "day") search.set("view", view);
    if (kind !== "all") search.set("kind", kind);
    if (q) search.set("q", q);
    return `/?${search.toString()}`;
  };

  const prevDate =
    view === "month"
      ? date
      : view === "week"
        ? addDays(date, -7)
        : addDays(date, -1);
  const nextDate =
    view === "month"
      ? date
      : view === "week"
        ? addDays(date, 7)
        : addDays(date, 1);
  const prevMonth =
    view === "month" ? shiftMonth(month, -1) : monthKeyOf(prevDate);
  const nextMonth =
    view === "month" ? shiftMonth(month, 1) : monthKeyOf(nextDate);

  const pageQuery: Record<string, string | undefined> = {
    date,
    month,
    view: view === "day" ? undefined : view,
    kind: kind === "all" ? undefined : kind,
    q,
    doctorId,
  };

  const headingRange = rangeLabel(from, to);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-medical/10 text-medical">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-navy">
                Date-wise Patient Activity
              </h2>
              <p className="text-xs text-muted-foreground">
                {headingRange} · {result.total} record{result.total === 1 ? "" : "s"}
                {kind !== "all" ? ` · ${kindLabel(kind)}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={navHref(prevDate, prevMonth)}
            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {view === "month" ? formatMonthLabel(prevMonth) : formatDateKeyLabel(prevDate)}
          </Link>
          <Link
            href={navHref(today, monthKeyOf(today))}
            className="btn btn-secondary btn-sm"
          >
            Today
          </Link>
          <Link
            href={navHref(nextDate, nextMonth)}
            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
          >
            {view === "month" ? formatMonthLabel(nextMonth) : formatDateKeyLabel(nextDate)}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* Category tabs with exact counts for the selected range */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ACTIVITY_KIND_OPTIONS.map((option) => {
              const count =
                option.value === "all"
                  ? allCount
                  : kindCounts[option.value as keyof typeof kindCounts];
              const active = kind === option.value;
              const search = new URLSearchParams();
              search.set("date", date);
              search.set("month", month);
              if (view !== "day") search.set("view", view);
              if (option.value !== "all") search.set("kind", option.value);
              if (q) search.set("q", q);
              return (
                <Link
                  key={option.value}
                  href={`/?${search.toString()}`}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-medical bg-medical text-white"
                      : "border-line bg-white text-navy hover:bg-info-bg",
                  ].join(" ")}
                >
                  {option.short}
                  <span
                    className={[
                      "rounded-full px-1.5 text-[10px] font-semibold",
                      active ? "bg-white/20" : "bg-page text-muted-foreground",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Date, search and view controls — all applied server-side */}
          <form method="GET" action="/" className="card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="dw-date" className="field-label">
                  Date
                </label>
                <input
                  id="dw-date"
                  type="date"
                  name="date"
                  defaultValue={date}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="dw-view" className="field-label">
                  View
                </label>
                <select
                  id="dw-view"
                  name="view"
                  defaultValue={view}
                  className="input"
                >
                  {VIEW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {kind !== "all" ? (
                <input type="hidden" name="kind" value={kind} />
              ) : null}

              <div className="min-w-[220px] flex-1">
                <label htmlFor="dw-q" className="field-label">
                  Search in this period
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="dw-q"
                    type="search"
                    name="q"
                    defaultValue={q ?? ""}
                    placeholder="Patient name, UHID or phone"
                    className="input w-full pl-9"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" className="btn btn-primary">
                  Apply
                </button>
                <Link
                  href={`/?date=${today}&month=${today.slice(0, 7)}`}
                  className="btn btn-secondary"
                >
                  Clear
                </Link>
              </div>
            </div>
          </form>

          {/* Selected period's patients and activities */}
          <div className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <h3 className="card-title">Patients &amp; activities</h3>
                <p className="card-subtitle">
                  {view === "day"
                    ? "Everything that happened on the selected date"
                    : `Records between ${headingRange}`}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {kind === "all" ? "All activity" : kindLabel(kind)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Age / Gender</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>OP / IP</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Department / Doctor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-14 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-page text-muted-foreground">
                          <ClipboardList className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-medium text-navy">
                          No patient activity in this period
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pick another date from the calendar, widen the view to
                          weekly or monthly, or clear the search.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="whitespace-nowrap font-medium text-medical">
                          <Link href={`/patients/${row.patientId}`} className="hover:underline">
                            {row.uhid}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/patients/${row.patientId}`}
                            className="inline-flex items-center gap-1.5 font-medium text-navy hover:text-medical hover:underline"
                          >
                            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.age} yrs · {row.gender}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.phone || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={[
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              row.opIp === "IP"
                                ? "bg-navy text-white"
                                : row.opIp === "OP"
                                  ? "bg-teal/10 text-teal"
                                  : "bg-page text-muted-foreground",
                            ].join(" ")}
                          >
                            {row.opIp}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium text-navy">
                          {kindLabel(row.kind)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateKeyLabel(localDateKey(row.at))}
                          <div className="text-[11px]">{formatHospitalTime(row.at)}</div>
                        </TableCell>
                        <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                          <div className="truncate">{row.department ?? "—"}</div>
                          {row.doctor ? (
                            <div className="truncate text-[11px]">Dr. {row.doctor}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Link href={row.href} className="btn btn-secondary btn-sm">
                            {row.reference}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Pagination
              basePath="/"
              query={pageQuery}
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </div>
        </div>

        <div className="space-y-3">
          <ActivityCalendar
            month={month}
            selectedDate={date}
            today={today}
            counts={calendarTotals}
            kind={kind}
            view={view}
            q={q}
          />
          <div className="card p-4">
            <p className="text-xs font-semibold text-navy">Selected date</p>
            <p className="mt-1 text-sm font-medium text-medical">
              {formatDateKeyLabel(date)}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Click any day with a count badge to load that day&apos;s patients.
              Counts are hospital-local ({process.env.HOSPITAL_TIMEZONE ?? "Asia/Kolkata"})
              and reflect registrations, OP visits, IP admissions, appointments,
              lab orders, billing and discharges.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
