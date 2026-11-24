/**
 * Reference-interval helpers shared by the lab result entry UI and the server.
 * Pure functions (no Prisma / no server-only) so the client can preview the
 * same flags the server will store.
 *
 * These helpers only compare a value with a configured interval. They never
 * produce a diagnosis — the flag is a HIGH / LOW indicator for the reader.
 */

export type ResultFlag = "LOW" | "HIGH" | "NORMAL" | "NONE";

export type ReferenceRangeLike = {
  gender: string;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  minValue: number | null;
  maxValue: number | null;
  displayRange: string | null;
  notes?: string | null;
};

export type PatientContext = {
  age?: number | null;
  gender?: string | null;
};

type RangeGender = "Male" | "Female" | "Both";

function normaliseGender(value: string | null | undefined): RangeGender {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "male" || v === "m") return "Male";
  if (v === "female" || v === "f") return "Female";
  return "Both";
}

/** Trims float noise so 13.00 renders as "13" and 0.30 as "0.3". */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Math.round(value * 10000) / 10000);
}

/**
 * Library display value: integers of 10,000+ get Indian digit grouping
 * (150,000) while decimals keep up to 3 places (13.5).
 */
export function formatDisplayValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) >= 10000) {
    // 150,000 — matches how counts are written on the hospital's reports.
    return new Intl.NumberFormat("en-US").format(value);
  }
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Auto-generated display used by the reference range library, e.g.
 * "70 - 99 mg/dL", "< 200 mg/dL", "> 40 mg/dL".
 */
export function buildDisplayRange(
  min: number | null | undefined,
  max: number | null | undefined,
  unit?: string | null,
): string | null {
  const u = (unit ?? "").trim();
  const suffix = u ? ` ${u}` : "";
  if (min != null && max != null) {
    return `${formatDisplayValue(min)} - ${formatDisplayValue(max)}${suffix}`;
  }
  if (min != null) return `> ${formatDisplayValue(min)}${suffix}`;
  if (max != null) return `< ${formatDisplayValue(max)}${suffix}`;
  return null;
}

/** "13 – 17 g/dL", "> 5", "< 200 mg/dL" … */
export function formatRangeBounds(
  min: number | null | undefined,
  max: number | null | undefined,
  unit?: string | null,
): string | null {
  let text: string | null = null;
  if (min != null && max != null) {
    text = `${formatNumber(min)} – ${formatNumber(max)}`;
  } else if (min != null) {
    text = `> ${formatNumber(min)}`;
  } else if (max != null) {
    text = `< ${formatNumber(max)}`;
  }
  if (!text) return null;
  const u = (unit ?? "").trim();
  return u ? `${text} ${u}` : text;
}

/**
 * Human-readable reference interval for a report row. A configured
 * `displayRange` override wins (e.g. "Negative", "< 200"); the unit is
 * appended when the override does not already mention it.
 */
export function formatReferenceRange(
  range: ReferenceRangeLike | null | undefined,
  unit?: string | null,
): string {
  if (!range) return "—";
  const u = (unit ?? "").trim();
  const override = range.displayRange?.trim();
  if (override) {
    if (u && !override.toLowerCase().includes(u.toLowerCase())) return `${override} ${u}`;
    return override;
  }
  return formatRangeBounds(range.minValue, range.maxValue, u) ?? "—";
}

/** True when the interval's gender and age band cover this patient. */
export function rangeAppliesTo(range: ReferenceRangeLike, patient: PatientContext): boolean {
  const rangeGender = normaliseGender(range.gender);
  const patientGender = normaliseGender(patient.gender);
  if (rangeGender !== "Both" && patientGender !== "Both" && rangeGender !== patientGender) {
    return false;
  }

  const age = patient.age;
  if (age == null || !Number.isFinite(age)) return true;
  if (range.ageMinYears != null && age < range.ageMinYears) return false;
  if (range.ageMaxYears != null && age > range.ageMaxYears) return false;
  return true;
}

function specificity(range: ReferenceRangeLike, patient: PatientContext): number {
  let score = 0;
  const rangeGender = normaliseGender(range.gender);
  if (rangeGender !== "Both" && rangeGender === normaliseGender(patient.gender)) score += 5;

  const hasAgeBand = range.ageMinYears != null || range.ageMaxYears != null;
  if (hasAgeBand) {
    // An interval that names the patient's age bracket (e.g. "Child 1-12") is
    // more specific than an unbracketed adult interval.
    score += 20;
    const lower = range.ageMinYears ?? 0;
    const upper = range.ageMaxYears ?? 200;
    // A narrower age bracket is a better match than a broad one.
    score += Math.max(0, 2 - (upper - lower) / 100);
  }
  return score;
}

/**
 * Picks the most specific interval that applies to the patient:
 * gender-specific beats "Both", and a matching age bracket beats an
 * unbracketed interval.
 */
export function resolveRangeForPatient<T extends ReferenceRangeLike>(
  ranges: readonly T[],
  patient: PatientContext,
): T | null {
  const candidates = ranges.filter((range) => rangeAppliesTo(range, patient));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => specificity(b, patient) - specificity(a, patient))[0];
}

/** Compares a numeric reading with its interval. No diagnosis is implied. */
export function flagResult(
  value: number | null | undefined,
  range: ReferenceRangeLike | null | undefined,
): ResultFlag {
  if (value == null || !Number.isFinite(value) || !range) return "NONE";
  if (range.minValue == null && range.maxValue == null) return "NONE";
  if (range.maxValue != null && value > range.maxValue) return "HIGH";
  if (range.minValue != null && value < range.minValue) return "LOW";
  return "NORMAL";
}

/** Reads the leading number of a free-text reading ("7,200 /mcL" → 7200). */
export function parseNumericResult(raw: string | null | undefined): number | null {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
