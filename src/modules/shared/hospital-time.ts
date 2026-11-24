/**
 * Hospital-local date helpers.
 *
 * The database stores timestamps in UTC. Hospital staff think in the hospital's
 * local calendar, so every "today"/"this month" boundary in the ERP must be
 * converted with the hospital timezone — not the server's or the browser's.
 *
 * Offset defaults to +330 minutes (IST). Override with HOSPITAL_TZ_OFFSET_MINUTES.
 */

export const HOSPITAL_TZ_OFFSET_MINUTES = Number(
  process.env.HOSPITAL_TZ_OFFSET_MINUTES ?? 330,
);

export const HOSPITAL_TIMEZONE = process.env.HOSPITAL_TIMEZONE ?? "Asia/Kolkata";

const DAY_MS = 86_400_000;
const OFFSET_MS = HOSPITAL_TZ_OFFSET_MINUTES * 60_000;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isValidDateKey(value?: string | null): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export function isValidMonthKey(value?: string | null): value is string {
  if (!value || !MONTH_KEY.test(value)) return false;
  const [y, m] = value.split("-").map(Number);
  return y >= 1900 && y <= 3000 && m >= 1 && m <= 12;
}

/** Calendar date (YYYY-MM-DD) of an instant, in hospital local time. */
export function localDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Local month (YYYY-MM) of an instant, in hospital local time. */
export function localMonthKey(date: Date): string {
  return localDateKey(date).slice(0, 7);
}

export function todayKey(): string {
  return localDateKey(new Date());
}

/** UTC instant corresponding to 00:00 hospital-local time on `key`. */
export function startOfHospitalDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_MS);
}

/** Half-open [gte, lt) range that covers exactly one hospital-local day. */
export function hospitalDayRange(key: string): { gte: Date; lt: Date } {
  const gte = startOfHospitalDay(key);
  return { gte, lt: new Date(gte.getTime() + DAY_MS) };
}

/** Half-open [gte, lt) range covering an inclusive pair of hospital dates. */
export function hospitalRange(fromKey: string, toKey: string): { gte: Date; lt: Date } {
  const gte = startOfHospitalDay(fromKey);
  const lt = new Date(startOfHospitalDay(toKey).getTime() + DAY_MS);
  return { gte, lt };
}

export function addDays(key: string, days: number): string {
  return localDateKey(new Date(startOfHospitalDay(key).getTime() + days * DAY_MS));
}

export function monthKeyOf(key: string): string {
  return key.slice(0, 7);
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthRangeDays(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysInMonth(monthKey))}` };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/** Monday → Sunday week containing `key`. */
export function weekRangeDays(key: string): { from: string; to: string } {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const mondayOffset = (dow + 6) % 7;
  const from = addDays(key, -mondayOffset);
  return { from, to: addDays(from, 6) };
}

export function formatHospitalDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: HOSPITAL_TIMEZONE,
  }).format(date);
}

export function formatHospitalTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: HOSPITAL_TIMEZONE,
  }).format(date);
}

export function formatDateKeyLabel(key: string): string {
  return formatHospitalDate(startOfHospitalDay(key));
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
