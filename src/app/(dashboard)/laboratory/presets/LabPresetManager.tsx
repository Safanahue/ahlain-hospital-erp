"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Copy,
  FlaskConical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export type PresetRange = {
  gender: "Male" | "Female" | "Both";
  ageMinYears: number | null;
  ageMaxYears: number | null;
  minValue: number | null;
  maxValue: number | null;
  displayRange: string | null;
  notes: string | null;
};

export type PresetParameter = {
  id?: string;
  section: string;
  name: string;
  unit: string;
  dataType: "NUMERIC" | "TEXT";
  sortOrder: number;
  ranges: PresetRange[];
};

export type PresetTemplate = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
  parameters: PresetParameter[];
};

type EditorRange = {
  key: string;
  gender: "Male" | "Female" | "Both";
  ageMin: string;
  ageMax: string;
  min: string;
  max: string;
  displayRange: string;
  notes: string;
};

type EditorParameter = {
  key: string;
  section: string;
  name: string;
  unit: string;
  dataType: "NUMERIC" | "TEXT";
  ranges: EditorRange[];
};

type Draft = {
  id: string | null;
  name: string;
  category: string;
  description: string;
  active: boolean;
  parameters: EditorParameter[];
};

const CATEGORIES = ["Haematology", "Biochemistry", "Microbiology", "Serology", "Pathology", "Other"];

let keySeed = 0;
function nextKey(prefix: string) {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

function emptyRange(): EditorRange {
  return {
    key: nextKey("range"),
    gender: "Both",
    ageMin: "",
    ageMax: "",
    min: "",
    max: "",
    displayRange: "",
    notes: "",
  };
}

function emptyParameter(): EditorParameter {
  return {
    key: nextKey("param"),
    section: "",
    name: "",
    unit: "",
    dataType: "NUMERIC",
    ranges: [emptyRange()],
  };
}

function draftFromTemplate(template: PresetTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description ?? "",
    active: template.active,
    parameters: template.parameters.map((parameter) => ({
      key: nextKey("param"),
      section: parameter.section,
      name: parameter.name,
      unit: parameter.unit,
      dataType: parameter.dataType,
      ranges: parameter.ranges.map((range) => ({
        key: nextKey("range"),
        gender: range.gender,
        ageMin: range.ageMinYears != null ? String(range.ageMinYears) : "",
        ageMax: range.ageMaxYears != null ? String(range.ageMaxYears) : "",
        min: range.minValue != null ? String(range.minValue) : "",
        max: range.maxValue != null ? String(range.maxValue) : "",
        displayRange: range.displayRange ?? "",
        notes: range.notes ?? "",
      })),
    })),
  };
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    category: "Haematology",
    description: "",
    active: true,
    parameters: [emptyParameter()],
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name.trim(),
    category: draft.category.trim() || "Haematology",
    description: draft.description.trim() || null,
    active: draft.active,
    parameters: draft.parameters.map((parameter, index) => ({
      section: parameter.section.trim(),
      name: parameter.name.trim(),
      unit: parameter.unit.trim(),
      dataType: parameter.dataType,
      sortOrder: index,
      ranges: parameter.ranges.map((range) => ({
        gender: range.gender,
        ageMinYears: toNumberOrNull(range.ageMin),
        ageMaxYears: toNumberOrNull(range.ageMax),
        minValue: toNumberOrNull(range.min),
        maxValue: toNumberOrNull(range.max),
        displayRange: range.displayRange.trim() || null,
        notes: range.notes.trim() || null,
      })),
    })),
  };
}

export default function LabPresetManager({
  initialTemplates,
  canManage,
}: {
  initialTemplates: PresetTemplate[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<PresetTemplate[]>(initialTemplates);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function updateDraft(updater: (current: Draft) => Draft) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function updateParameter(index: number, patch: Partial<EditorParameter>) {
    updateDraft((current) => ({
      ...current,
      parameters: current.parameters.map((parameter, i) =>
        i === index ? { ...parameter, ...patch } : parameter,
      ),
    }));
  }

  function updateRange(parameterIndex: number, rangeIndex: number, patch: Partial<EditorRange>) {
    updateDraft((current) => ({
      ...current,
      parameters: current.parameters.map((parameter, i) =>
        i === parameterIndex
          ? {
              ...parameter,
              ranges: parameter.ranges.map((range, j) =>
                j === rangeIndex ? { ...range, ...patch } : range,
              ),
            }
          : parameter,
      ),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    if (!draft.name.trim()) {
      setError("Give the preset a name");
      return;
    }
    if (draft.parameters.length === 0) {
      setError("Add at least one test parameter");
      return;
    }
    for (const parameter of draft.parameters) {
      if (!parameter.name.trim()) {
        setError("Every parameter needs a name");
        return;
      }
      if (parameter.ranges.length === 0) {
        setError(`Add a reference range for "${parameter.name}"`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        draft.id ? `/api/laboratory/templates/${draft.id}` : "/api/laboratory/templates",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFromDraft(draft)),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save the preset");

      const saved = data.template as PresetTemplate;
      setTemplates((current) =>
        draft.id
          ? current.map((template) => (template.id === saved.id ? saved : template))
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the preset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/laboratory/templates/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to duplicate the preset");
      setTemplates((current) => [...current, data.template]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate the preset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/laboratory/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete the preset");
      }
      setTemplates((current) => current.filter((template) => template.id !== id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the preset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="card-title">Lab Report Presets</h2>
          <p className="card-subtitle">
            Reusable report templates with units and age/gender reference ranges. Edit any range at
            any time — issued reports keep their own snapshot.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              setDraft(emptyDraft());
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New preset
          </button>
        ) : null}
      </div>

      {error && !draft ? (
        <p className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.length === 0 ? (
          <div className="card px-5 py-10 text-center md:col-span-2 xl:col-span-3">
            <FlaskConical className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium text-navy">No report presets yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a preset such as CBC or LFT, or run the starter preset seeder.
            </p>
          </div>
        ) : (
          templates.map((template) => (
            <article key={template.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-navy">{template.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {template.category} · {template.parameters.length} parameter
                    {template.parameters.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    template.active ? "bg-success-bg text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {template.active ? "Active" : "Inactive"}
                </span>
              </div>

              {template.description ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {template.description}
                </p>
              ) : null}

              <ul className="mt-3 space-y-1 border-t border-line pt-2 text-[11px] text-muted-foreground">
                {template.parameters.slice(0, 4).map((parameter, index) => (
                  <li key={`${template.id}-${index}`} className="flex justify-between gap-2">
                    <span className="truncate">{parameter.name}</span>
                    <span className="shrink-0 font-mono">{parameter.unit || "—"}</span>
                  </li>
                ))}
                {template.parameters.length > 4 ? (
                  <li className="italic">+{template.parameters.length - 4} more</li>
                ) : null}
              </ul>

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setError(null);
                      setDraft(draftFromTemplate(template));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={saving}
                    onClick={() => handleDuplicate(template.id)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Duplicate
                  </button>
                  {confirmDelete === template.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm bg-danger text-white"
                        disabled={saving}
                        onClick={() => handleDelete(template.id)}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmDelete(template.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4">
          <div className="my-6 w-full max-w-4xl rounded-xl border border-line bg-white shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-navy">
                  {draft.id ? "Edit report preset" : "New report preset"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Parameters, units and reference ranges all stay editable
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-page"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="field-label">Preset name *</label>
                  <input
                    className="input w-full"
                    value={draft.name}
                    onChange={(e) => updateDraft((c) => ({ ...c, name: e.target.value }))}
                    placeholder="e.g. CBC / Haematology"
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Category</label>
                  <select
                    className="input w-full"
                    value={draft.category}
                    onChange={(e) => updateDraft((c) => ({ ...c, category: e.target.value }))}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-navy">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) => updateDraft((c) => ({ ...c, active: e.target.checked }))}
                    />
                    Available for result entry
                  </label>
                </div>
              </div>

              <div>
                <label className="field-label">Description</label>
                <input
                  className="input w-full"
                  value={draft.description}
                  onChange={(e) => updateDraft((c) => ({ ...c, description: e.target.value }))}
                  placeholder="Optional note shown to lab staff"
                />
              </div>

              <div className="space-y-3">
                {draft.parameters.map((parameter, parameterIndex) => (
                  <div key={parameter.key} className="rounded-lg border border-line p-3">
                    <div className="grid gap-2 md:grid-cols-12">
                      <div className="md:col-span-4">
                        <label className="field-label text-xs">Parameter / test description</label>
                        <input
                          className="input w-full"
                          value={parameter.name}
                          onChange={(e) =>
                            updateParameter(parameterIndex, { name: e.target.value })
                          }
                          placeholder="e.g. Haemoglobin (Hb)"
                          required
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="field-label text-xs">Section heading</label>
                        <input
                          className="input w-full"
                          value={parameter.section}
                          onChange={(e) =>
                            updateParameter(parameterIndex, { section: e.target.value })
                          }
                          placeholder="e.g. Differential Count"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="field-label text-xs">Unit</label>
                        <input
                          className="input w-full"
                          value={parameter.unit}
                          onChange={(e) =>
                            updateParameter(parameterIndex, { unit: e.target.value })
                          }
                          placeholder="g/dL"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="field-label text-xs">Value type</label>
                        <select
                          className="input w-full"
                          value={parameter.dataType}
                          onChange={(e) =>
                            updateParameter(parameterIndex, {
                              dataType: e.target.value as "NUMERIC" | "TEXT",
                            })
                          }
                        >
                          <option value="NUMERIC">Numeric</option>
                          <option value="TEXT">Text</option>
                        </select>
                      </div>
                      <div className="flex items-end md:col-span-1">
                        <button
                          type="button"
                          className="btn btn-danger btn-sm w-full"
                          disabled={draft.parameters.length === 1}
                          onClick={() =>
                            updateDraft((c) => ({
                              ...c,
                              parameters: c.parameters.filter((_, i) => i !== parameterIndex),
                            }))
                          }
                          title="Remove parameter"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Reference ranges (age / gender specific)
                      </p>
                      {parameter.ranges.map((range, rangeIndex) => (
                        <div
                          key={range.key}
                          className="grid items-end gap-1.5 rounded-md bg-page/70 p-2 md:grid-cols-12"
                        >
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Gender</label>
                            <select
                              className="input h-8 w-full text-xs"
                              value={range.gender}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, {
                                  gender: e.target.value as "Male" | "Female" | "Both",
                                })
                              }
                            >
                              <option value="Both">Both</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Age from (yr)</label>
                            <input
                              className="input h-8 w-full text-xs"
                              inputMode="numeric"
                              value={range.ageMin}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, { ageMin: e.target.value })
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Age to (yr)</label>
                            <input
                              className="input h-8 w-full text-xs"
                              inputMode="numeric"
                              value={range.ageMax}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, { ageMax: e.target.value })
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Min</label>
                            <input
                              className="input h-8 w-full text-xs"
                              inputMode="decimal"
                              value={range.min}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, { min: e.target.value })
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Max</label>
                            <input
                              className="input h-8 w-full text-xs"
                              inputMode="decimal"
                              value={range.max}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, { max: e.target.value })
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted-foreground">Note</label>
                            <input
                              className="input h-8 w-full text-xs"
                              value={range.notes}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, { notes: e.target.value })
                              }
                              placeholder="e.g. fasting"
                            />
                          </div>
                          <div className="md:col-span-11">
                            <label className="text-[10px] text-muted-foreground">
                              Display override (optional, e.g. &ldquo;Negative&rdquo;)
                            </label>
                            <input
                              className="input h-8 w-full text-xs"
                              value={range.displayRange}
                              onChange={(e) =>
                                updateRange(parameterIndex, rangeIndex, {
                                  displayRange: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="md:col-span-1">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm w-full"
                              disabled={parameter.ranges.length === 1}
                              onClick={() =>
                                updateParameter(parameterIndex, {
                                  ranges: parameter.ranges.filter((_, i) => i !== rangeIndex),
                                })
                              }
                              title="Remove range"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => updateParameter(parameterIndex, { ranges: [...parameter.ranges, emptyRange()] })}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add range
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  updateDraft((c) => ({ ...c, parameters: [...c.parameters, emptyParameter()] }))
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add parameter
              </button>

              {error ? (
                <p className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Create preset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
