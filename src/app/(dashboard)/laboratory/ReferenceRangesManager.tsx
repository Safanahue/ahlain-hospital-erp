"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  FlaskConical,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { buildDisplayRange } from "@/modules/laboratory/ranges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface LabRefRangeItem {
  id: string;
  serviceId?: string | null;
  testName: string;
  parameterName: string;
  gender: string;
  ageGroup: string;
  minValue: number | null;
  maxValue: number | null;
  unit: string;
  displayRange: string | null;
  notes?: string | null;
  category?: string | null;
  sortOrder?: number;
}

export interface LabServiceOption {
  id: string;
  name: string;
  code: string;
}

const CATEGORY_OPTIONS = [
  "Haematology",
  "Biochemistry",
  "Microbiology",
  "Serology",
  "Urinalysis",
  "Pathology",
  "Other",
];

const AGE_GROUPS = [
  "Neonate (0-28 days)",
  "Infant (1-12 months)",
  "Child (1-5 yrs)",
  "Child (6-12 yrs)",
  "Adolescent (13-17 yrs)",
  "Adult",
  "Elderly (65+ yrs)",
];

const COMMON_UNITS = [
  "g/dL",
  "mg/dL",
  "g/L",
  "/mcL",
  "10^3/µL",
  "million/µL",
  "mmol/L",
  "IU/L",
  "U/L",
  "fL",
  "pg",
  "%",
  "ratio",
  "ng/mL",
  "pg/mL",
  "sec",
  "mm/hr",
];

type Gender = "Male" | "Female" | "Both";

type Editor = {
  id: string | null;
  testName: string;
  category: string;
  isNewTest: boolean;
  parameterName: string;
  gender: Gender;
  ageGroup: string;
  min: string;
  max: string;
  unit: string;
  displayRange: string;
  /** True once the user types a custom display, so value edits stop overwriting it. */
  displayTouched: boolean;
  notes: string;
};

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function blankEditor(testName: string, category: string): Editor {
  return {
    id: null,
    testName,
    category,
    isNewTest: false,
    parameterName: "",
    gender: "Both",
    ageGroup: "Adult",
    min: "",
    max: "",
    unit: "",
    displayRange: "",
    displayTouched: false,
    notes: "",
  };
}

function firstSavedEditor(ranges: LabRefRangeItem[]): Editor | null {
  const first = [...ranges].sort(
    (a, b) =>
      a.testName.localeCompare(b.testName) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.parameterName.localeCompare(b.parameterName),
  )[0];
  return first ? editorFromRange(first) : null;
}

function editorFromRange(range: LabRefRangeItem, options?: { asCopy?: boolean }): Editor {
  return {
    id: options?.asCopy ? null : range.id,
    testName: range.testName,
    category: range.category ?? "",
    isNewTest: false,
    parameterName: range.parameterName,
    gender: (range.gender as Gender) ?? "Both",
    ageGroup: range.ageGroup,
    min: toInput(range.minValue),
    max: toInput(range.maxValue),
    unit: range.unit,
    displayRange: range.displayRange ?? "",
    displayTouched: false,
    notes: range.notes ?? "",
  };
}

export default function ReferenceRangesManager({
  services,
  initialRanges,
  canManage,
}: {
  services: LabServiceOption[];
  initialRanges: LabRefRangeItem[];
  canManage: boolean;
}) {
  const router = useRouter();

  const [ranges, setRanges] = useState<LabRefRangeItem[]>(initialRanges);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedTest, setSelectedTest] = useState(
    () => firstSavedEditor(initialRanges)?.testName ?? services[0]?.name ?? "",
  );

  const [editorDraft, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  /** Every test known to the library (from saved ranges) plus lab services. */
  const tests = useMemo(() => {
    const map = new Map<
      string,
      { name: string; category: string; count: number; parameters: string[] }
    >();

    for (const range of ranges) {
      const entry =
        map.get(range.testName) ??
        { name: range.testName, category: range.category ?? "", count: 0, parameters: [] };
      entry.count += 1;
      if (!entry.category && range.category) entry.category = range.category;
      if (!entry.parameters.includes(range.parameterName)) {
        entry.parameters.push(range.parameterName);
      }
      map.set(range.testName, entry);
    }

    for (const service of services) {
      if (!map.has(service.name)) {
        map.set(service.name, { name: service.name, category: "", count: 0, parameters: [] });
      }
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [ranges, services]);

  const categories = useMemo(() => {
    const present = [...new Set(tests.map((test) => test.category).filter(Boolean))];
    const known = CATEGORY_OPTIONS.filter((category) => present.includes(category));
    const extra = present.filter((category) => !CATEGORY_OPTIONS.includes(category));
    return [...known, ...extra];
  }, [tests]);

  const filteredTests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((test) => {
      if (categoryFilter && test.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        test.name.toLowerCase().includes(q) ||
        test.parameters.some((parameter) => parameter.toLowerCase().includes(q))
      );
    });
  }, [tests, query, categoryFilter]);

  const activeTest = useMemo(() => {
    if (filteredTests.some((test) => test.name === selectedTest)) {
      return filteredTests.find((test) => test.name === selectedTest)!;
    }
    return filteredTests[0] ?? null;
  }, [filteredTests, selectedTest]);

  const testRanges = useMemo(() => {
    if (!activeTest) return [];
    return ranges
      .filter((range) => range.testName === activeTest.name)
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.parameterName.localeCompare(b.parameterName) ||
          a.ageGroup.localeCompare(b.ageGroup) ||
          a.gender.localeCompare(b.gender),
      );
  }, [ranges, activeTest]);

  /**
   * The form always reflects the visible test. When the user has not started
   * editing that test, its first saved interval is loaded automatically, so
   * nothing has to be re-typed for an already-saved test.
   */
  const editor: Editor | null = useMemo(() => {
    if (!activeTest) return editorDraft;
    if (editorDraft && (editorDraft.isNewTest || editorDraft.testName === activeTest.name)) {
      return editorDraft;
    }
    const first = testRanges[0];
    return first ? editorFromRange(first) : blankEditor(activeTest.name, activeTest.category);
  }, [activeTest, testRanges, editorDraft]);

  const autoDisplay = editor
    ? buildDisplayRange(toNumberOrNull(editor.min), toNumberOrNull(editor.max), editor.unit)
    : null;

  /** Selecting a test loads its saved ranges into the form (no blank re-entry). */
  function selectTest(testName: string) {
    setSelectedTest(testName);
    setError(null);
    const first = ranges
      .filter((range) => range.testName === testName)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    const testCategory = ranges.find((range) => range.testName === testName)?.category ?? "";
    setEditor(first ? editorFromRange(first) : blankEditor(testName, testCategory));
  }

  /** Starts a new interval for the visible test, keeping its test/unit context. */
  function startAddForActiveTest() {
    setError(null);
    if (!activeTest) return;
    const base = testRanges[0];
    setSelectedTest(activeTest.name);
    setEditor(
      base
        ? {
            ...blankEditor(activeTest.name, base.category ?? activeTest.category),
            unit: base.unit,
            gender: base.gender as Gender,
            ageGroup: base.ageGroup,
          }
        : blankEditor(activeTest.name, activeTest.category),
    );
  }

  function startNewTest() {
    setError(null);
    setEditor({
      ...blankEditor("", categoryFilter || "Haematology"),
      isNewTest: true,
    });
  }

  /** Picking an existing parameter copies its saved range values into the form. */
  function handleParameterChange(value: string) {
    if (!editor) return;
    const match = ranges.find(
      (range) =>
        range.testName === editor.testName &&
        range.parameterName.toLowerCase() === value.trim().toLowerCase(),
    );
    if (match && !editor.id) {
      setEditor({
        ...editor,
        parameterName: match.parameterName,
        gender: match.gender as Gender,
        ageGroup: match.ageGroup,
        min: toInput(match.minValue),
        max: toInput(match.maxValue),
        unit: match.unit,
        displayRange: match.displayRange ?? "",
        displayTouched: false,
        notes: match.notes ?? "",
        category: match.category ?? editor.category,
      });
      return;
    }
    setEditor({ ...editor, parameterName: value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;

    const testName = editor.testName.trim();
    const parameterName = editor.parameterName.trim();
    const unit = editor.unit.trim();

    if (!testName) {
      setError("Test name is required");
      return;
    }
    if (!parameterName) {
      setError("Parameter name is required");
      return;
    }
    if (!unit) {
      setError("Unit is required");
      return;
    }

    const minValue = toNumberOrNull(editor.min);
    const maxValue = toNumberOrNull(editor.max);
    if (minValue != null && maxValue != null && minValue > maxValue) {
      setError("Minimum value cannot exceed maximum value");
      return;
    }

    const sameTest = ranges.filter((range) => range.testName === testName);
    const parameterOrder = [...new Set(sameTest.map((range) => range.parameterName))];
    const sortOrder = parameterOrder.includes(parameterName)
      ? parameterOrder.indexOf(parameterName)
      : parameterOrder.length;

    const body = {
      testName,
      parameterName,
      gender: editor.gender,
      ageGroup: editor.ageGroup.trim() || "Adult",
      minValue,
      maxValue,
      unit,
      displayRange: editor.displayRange.trim() || autoDisplay || null,
      notes: editor.notes.trim() || null,
      category: editor.category.trim() || null,
      sortOrder,
      ...(editor.isNewTest ? { createService: true } : {}),
    };

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        editor.id
          ? `/api/laboratory/reference-ranges/${editor.id}`
          : "/api/laboratory/reference-ranges",
        {
          method: editor.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editor.id
              ? {
                  parameterName: body.parameterName,
                  gender: body.gender,
                  ageGroup: body.ageGroup,
                  minValue: body.minValue,
                  maxValue: body.maxValue,
                  unit: body.unit,
                  displayRange: body.displayRange,
                  notes: body.notes,
                  category: body.category,
                  sortOrder: body.sortOrder,
                }
              : body,
          ),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save the reference range");

      const saved = data.range as LabRefRangeItem;
      setRanges((current) =>
        editor.id
          ? current.map((range) => (range.id === saved.id ? saved : range))
          : [...current, saved],
      );
      setSelectedTest(editor.testName);
      setEditor(editorFromRange(saved));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the reference range");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/laboratory/reference-ranges/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete the reference range");
      }
      setRanges((current) => current.filter((range) => range.id !== id));
      setDeleteConfirmId(null);
      if (editor?.id === id) setEditor(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the reference range");
    } finally {
      setLoading(false);
    }
  }

  const totalTests = tests.filter((test) => test.count > 0).length;
  const totalParameters = new Set(ranges.map((range) => `${range.testName}::${range.parameterName}`)).size;

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="card-header flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-info-bg p-2 text-info">
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="card-title">Lab Reference Range Library</h2>
            <p className="card-subtitle">
              {totalTests} test{totalTests === 1 ? "" : "s"} · {totalParameters} parameter
              {totalParameters === 1 ? "" : "s"} · {ranges.length} saved interval
              {ranges.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {canManage ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={startNewTest}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add new test
          </button>
        ) : null}
      </div>

      {/* Search + category + test selectors */}
      <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="range-search" className="field-label text-xs">
            Search tests or parameters
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="range-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Haemoglobin, Bilirubin, CBC"
              className="input w-full pl-9"
            />
          </div>
        </div>

        <div>
          <label htmlFor="range-category" className="field-label text-xs">
            Category
          </label>
          <select
            id="range-category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setEditor(null);
            }}
            className="input"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="range-test" className="field-label text-xs">
            Test
          </label>
          <select
            id="range-test"
            value={activeTest?.name ?? ""}
            onChange={(e) => selectTest(e.target.value)}
            className="input min-w-[260px]"
          >
            {filteredTests.length === 0 ? (
              <option value="">No matching tests</option>
            ) : (
              filteredTests.map((test) => (
                <option key={test.name} value={test.name}>
                  {test.name}
                  {test.category ? ` — ${test.category}` : ""} ({test.count})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {error && !editor ? (
        <p className="m-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-xs text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* Editor — pre-filled from the selected test's saved ranges */}
      {canManage && editor ? (
        <form onSubmit={handleSubmit} className="border-b border-line bg-page/60 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-navy">
                {editor.id ? "Edit saved range" : editor.isNewTest ? "New test & first range" : "Add range"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {editor.id
                  ? "Changes are saved to the library and used for future reports."
                  : "Values are pre-filled from the library — change only what differs."}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditor(null)}
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label htmlFor="range-test-name" className="field-label text-xs">
                Test * {editor.isNewTest ? <span className="text-danger">(new)</span> : null}
              </label>
              <input
                id="range-test-name"
                list="library-test-options"
                className="input w-full"
                value={editor.testName}
                onChange={(e) =>
                  setEditor({ ...editor, testName: e.target.value, isNewTest: true })
                }
                placeholder="e.g. CBC / Haematology"
                required
              />
              <datalist id="library-test-options">
                {tests.map((test) => (
                  <option key={test.name} value={test.name} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="range-category-input" className="field-label text-xs">
                Category
              </label>
              <select
                id="range-category-input"
                className="input w-full"
                value={editor.category}
                onChange={(e) => setEditor({ ...editor, category: e.target.value })}
              >
                <option value="">Uncategorised</option>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5">
              <label htmlFor="range-parameter" className="field-label text-xs">
                Parameter *
              </label>
              <input
                id="range-parameter"
                list="library-parameter-options"
                className="input w-full"
                value={editor.parameterName}
                onChange={(e) => handleParameterChange(e.target.value)}
                placeholder="e.g. Haemoglobin (Hb)"
                required
              />
              <datalist id="library-parameter-options">
                {[...new Set(testRanges.map((range) => range.parameterName))].map((parameter) => (
                  <option key={parameter} value={parameter} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="range-gender" className="field-label text-xs">
                Gender *
              </label>
              <select
                id="range-gender"
                className="input w-full"
                value={editor.gender}
                onChange={(e) => setEditor({ ...editor, gender: e.target.value as Gender })}
              >
                <option value="Both">Both (Male &amp; Female)</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="range-age" className="field-label text-xs">
                Age group *
              </label>
              <input
                id="range-age"
                list="library-age-options"
                className="input w-full"
                value={editor.ageGroup}
                onChange={(e) => setEditor({ ...editor, ageGroup: e.target.value })}
                placeholder="e.g. Adult"
                required
              />
              <datalist id="library-age-options">
                {AGE_GROUPS.map((ageGroup) => (
                  <option key={ageGroup} value={ageGroup} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="range-min" className="field-label text-xs">
                Minimum
              </label>
              <input
                id="range-min"
                type="number"
                step="any"
                className="input w-full"
                value={editor.min}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    min: e.target.value,
                    displayRange: editor.displayTouched ? editor.displayRange : "",
                  })
                }
                placeholder="e.g. 70"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="range-max" className="field-label text-xs">
                Maximum
              </label>
              <input
                id="range-max"
                type="number"
                step="any"
                className="input w-full"
                value={editor.max}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    max: e.target.value,
                    displayRange: editor.displayTouched ? editor.displayRange : "",
                  })
                }
                placeholder="e.g. 99"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="range-unit" className="field-label text-xs">
                Unit *
              </label>
              <input
                id="range-unit"
                list="range-unit-options"
                className="input w-full"
                value={editor.unit}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    unit: e.target.value,
                    displayRange: editor.displayTouched ? editor.displayRange : "",
                  })
                }
                placeholder="mg/dL"
                required
              />
              <datalist id="range-unit-options">
                {COMMON_UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-12">
            <div className="md:col-span-7">
              <label htmlFor="range-display" className="field-label text-xs">
                Display in report{" "}
                {autoDisplay ? (
                  <span className="font-normal text-muted-foreground">
                    — auto: <span className="font-mono text-navy">{autoDisplay}</span>
                  </span>
                ) : null}
              </label>
              <input
                id="range-display"
                className="input w-full"
                value={editor.displayRange}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    displayRange: e.target.value,
                    displayTouched: e.target.value.trim().length > 0,
                  })
                }
                placeholder={autoDisplay ?? "Generated from min / max / unit"}
              />
            </div>
            <div className="md:col-span-5">
              <label htmlFor="range-notes" className="field-label text-xs">
                Note (optional)
              </label>
              <input
                id="range-notes"
                className="input w-full"
                value={editor.notes}
                onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                placeholder="e.g. Fasting sample, adult male"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                <Check className="h-3.5 w-3.5" aria-hidden />
                {loading ? "Saving…" : editor.id ? "Save changes" : "Save to library"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading}
                onClick={() => startAddForActiveTest()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add another range
              </button>
            </div>
            {editor.id ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditor({ ...editor, id: null })}
                  title="Save these values as a new range"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Save as new
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={loading}
                  onClick={() => handleDelete(editor.id!)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* Saved ranges for the selected test */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">
            {activeTest ? activeTest.name : "Reference ranges"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {activeTest?.category ? `${activeTest.category} · ` : ""}
            {testRanges.length} saved interval{testRanges.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && activeTest ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => startAddForActiveTest()}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add range for this test
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parameter</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Age group</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Display</TableHead>
              {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {testRanges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 8 : 7} className="px-4 py-12 text-center">
                  <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-navy">
                    No reference ranges saved for {activeTest?.name ?? "this test"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canManage
                      ? "Add the first interval — the form above is pre-filled for this test."
                      : "An admin or the lab in-charge can add intervals for this test."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              testRanges.map((row) => (
                <TableRow key={row.id} className="hover:bg-page/60">
                  <TableCell className="font-medium text-navy">
                    {row.parameterName}
                    {row.notes ? (
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {row.notes}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        row.gender === "Male"
                          ? "border-medical/30 bg-info-bg text-medical"
                          : row.gender === "Female"
                            ? "border-pink-200 bg-pink-50 text-pink-700"
                            : "border-line bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.gender}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-navy">{row.ageGroup}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-navy">
                    {row.minValue ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-navy">
                    {row.maxValue ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.unit}</TableCell>
                  <TableCell>
                    <span className="rounded border border-success/30 bg-success-bg px-2 py-0.5 font-mono text-xs text-success">
                      {row.displayRange ?? buildDisplayRange(row.minValue, row.maxValue, row.unit) ?? "—"}
                    </span>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {deleteConfirmId === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn btn-sm bg-danger text-white"
                            disabled={loading}
                            onClick={() => handleDelete(row.id)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-page hover:text-navy"
                            onClick={() => {
                              setEditor(editorFromRange(row));
                              setSelectedTest(row.testName);
                            }}
                            title="Edit this saved range"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-page hover:text-navy"
                            onClick={() => {
                              setEditor(editorFromRange(row, { asCopy: true }));
                              setSelectedTest(row.testName);
                            }}
                            title="Duplicate for another gender or age group"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-bg hover:text-danger"
                            onClick={() => setDeleteConfirmId(row.id)}
                            title="Delete this range"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
