"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export default function ActivityCalendar({
  month,
  selectedDate,
  today,
  counts,
  kind,
  view,
  q,
}: {
  month: string;
  selectedDate: string;
  today: string;
  counts: Record<string, number>;
  kind: string;
  view: string;
  q?: string;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leading = (firstDow + 6) % 7; // Monday-first grid

  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(`${year}-${pad(monthNumber)}-${pad(day)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const href = (params: { date?: string; month?: string }) => {
    const search = new URLSearchParams();
    if (params.date) search.set("date", params.date);
    if (params.month) search.set("month", params.month);
    if (view && view !== "day") search.set("view", view);
    if (kind && kind !== "all") search.set("kind", kind);
    if (q) search.set("q", q);
    const qs = search.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={href({ month: shiftMonth(month, -1), date: selectedDate })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-navy hover:bg-page"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-navy">{monthLabel(month)}</span>
          <Link
            href={href({ date: today, month: today.slice(0, 7) })}
            className="text-[11px] font-medium text-medical hover:underline"
          >
            Jump to today
          </Link>
        </div>

        <Link
          href={href({ month: shiftMonth(month, 1), date: selectedDate })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-navy hover:bg-page"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {cells.map((key, index) => {
          if (!key) return <div key={`blank-${index}`} className="h-10" />;

          const count = counts[key] ?? 0;
          const isToday = key === today;
          const isSelected = key === selectedDate;

          return (
            <Link
              key={key}
              href={href({ date: key, month })}
              aria-current={isSelected ? "date" : undefined}
              title={
                count > 0
                  ? `${key}: ${count} patient activit${count === 1 ? "y" : "ies"}`
                  : `${key}: no activity`
              }
              className={[
                "relative flex h-10 flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors",
                isSelected
                  ? "border-medical bg-medical text-white shadow-2xs"
                  : count > 0
                    ? "border-line bg-white text-navy hover:border-medical/60 hover:bg-info-bg"
                    : "border-transparent text-muted-foreground hover:bg-page",
                isToday && !isSelected ? "ring-1 ring-teal" : "",
              ].join(" ")}
            >
              <span>{Number(key.slice(8, 10))}</span>
              {count > 0 ? (
                <span
                  className={[
                    "mt-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-4",
                    isSelected ? "bg-white/20 text-white" : "bg-teal/10 text-teal",
                  ].join(" ")}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-teal" /> Has activity
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-medical" /> Selected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full ring-1 ring-teal" /> Today
        </span>
      </div>
    </div>
  );
}
