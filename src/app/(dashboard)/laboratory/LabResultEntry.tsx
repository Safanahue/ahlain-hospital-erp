"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck, X } from "lucide-react";
import {
  flagResult,
  formatReferenceRange,
  parseNumericResult,
  resolveRangeForPatient,
  type ReferenceRangeLike,
} from "@/modules/laboratory/ranges";

export type ResultTemplateRange = ReferenceRangeLike;

export type ResultTemplate = {
  id: string;
  name: string;
  category: string;
  parameters: {
    id: string;
    section: string;
    name: string;
    unit: string;
    dataType: "NUMERIC" | "TEXT";
    sortOrder: number;
    ranges: ResultTemplateRange[];
  }[];
};

export default function LabResultEntry({
  orderId,
  testName,
  patient,
  templates,
}: {
  orderId: string;
  testName: string;
  patient: { age: number; gender: string };
  templates: ResultTemplate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState("");

  const defaultTemplateId = useMemo(() => {
    const lower = testName.toLowerCase();
    const matched = templates.find(
      (template) =>
        lower.includes(template.name.toLowerCase()) ||
        template.name.toLowerCase().includes(lower),
    );
    return matched?.id ?? templates[0]?.id ?? "";
  }, [templates, testName]);

  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [values, setValues] = useState<Record<string, string>>({});

  const template = templates.find((item) => item.id === templateId) ?? null;

  function reset() {
    setTemplateId(defaultTemplateId);
    setValues({});
    setFindings("");
    setError(null);
  }

  function rowsForEntry() {
    if (!template) return [];
    return template.parameters.map((parameter) => {
      const range = resolveRangeForPatient(parameter.ranges, patient);
      return {
        parameter,
        range,
        reference: range ? formatReferenceRange(range, parameter.unit) : "—",
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!template) {
      setError("Choose a report preset first");
      return;
    }

    const missing = template.parameters.filter(
      (parameter) => !(values[parameter.id] ?? "").trim(),
    );
    if (missing.length > 0) {
      setError(`Enter a value for: ${missing.map((p) => p.name).join(", ")}`);
      return;
    }

    const results = rowsForEntry().map(({ parameter, range, reference }, index) => ({
      parameterId: parameter.id,
      section: parameter.section,
      parameterName: parameter.name,
      resultValue: values[parameter.id].trim(),
      unit: parameter.unit,
      referenceRange: reference,
      flag: flagResult(parseNumericResult(values[parameter.id]), range),
      sortOrder: parameter.sortOrder ?? index,
    }));

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/laboratory/orders/${orderId}/results`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, findings, results }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save results");
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save results");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        title="Enter results from a saved report preset"
      >
        <FileCheck className="h-3.5 w-3.5" aria-hidden />
        Enter Results
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4">
          <div className="my-6 w-full max-w-3xl rounded-xl border border-line bg-white shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-navy">Enter results — {testName}</h3>
                <p className="text-xs text-muted-foreground">
                  Reference ranges are resolved for this patient ({patient.age === 30 ? "—" : `${patient.age} yrs`},{" "}
                  {patient.gender.toLowerCase()}) and can be edited in presets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-page"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label className="field-label">Report preset</label>
                <select
                  className="input w-full"
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setValues({});
                  }}
                >
                  <option value="">Select a preset…</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.parameters.length} parameters)
                    </option>
                  ))}
                </select>
                {templates.length === 0 ? (
                  <p className="mt-1 text-xs text-danger">
                    No presets available. Create one under Laboratory → Report presets.
                  </p>
                ) : null}
              </div>

              {template ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-page text-left text-navy">
                        <th className="px-3 py-2 font-semibold">Test description</th>
                        <th className="w-40 px-3 py-2 font-semibold">Value observed</th>
                        <th className="w-20 px-3 py-2 font-semibold">Unit</th>
                        <th className="px-3 py-2 font-semibold">Reference range</th>
                        <th className="w-14 px-3 py-2 font-semibold">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsForEntry().map(({ parameter, range, reference }) => {
                        const value = values[parameter.id] ?? "";
                        const flag = flagResult(parseNumericResult(value), range);
                        return (
                          <tr key={parameter.id} className="border-t border-line">
                            <td className="px-3 py-2">
                              <div className="font-medium text-navy">{parameter.name}</div>
                              {parameter.section ? (
                                <div className="text-[10px] text-muted-foreground">
                                  {parameter.section}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="input h-8 w-full font-mono text-xs"
                                value={value}
                                onChange={(e) =>
                                  setValues((current) => ({
                                    ...current,
                                    [parameter.id]: e.target.value,
                                  }))
                                }
                                placeholder={parameter.dataType === "TEXT" ? "Text" : "e.g. 13.8"}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {parameter.unit || "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{reference}</td>
                            <td className="px-3 py-2">
                              {flag === "HIGH" ? (
                                <span className="rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold text-danger">
                                  HIGH
                                </span>
                              ) : flag === "LOW" ? (
                                <span className="rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-bold text-info">
                                  LOW
                                </span>
                              ) : flag === "NORMAL" ? (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div>
                <label className="field-label">Remarks / findings</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="Optional technician or pathologist remark"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Flags only compare the reading with the configured reference interval — they are not
                a diagnosis.
              </p>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving || !template}
                >
                  {saving ? "Saving…" : "Save results"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
