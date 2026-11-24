"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { formatINR } from "@/modules/shared/money";

const DISCHARGE_TYPES = [
  { value: "CURED", label: "Cured" },
  { value: "IMPROVED", label: "Improved" },
  { value: "REFERRED", label: "Referred" },
  { value: "LAMA", label: "Left against medical advice" },
  { value: "TRANSFERRED_OUT", label: "Transferred to another hospital" },
  { value: "DEATH", label: "Death" },
];

const CATEGORIES = [
  { value: "ROOM_CHARGES", label: "Room charges" },
  { value: "DOCTOR_CONSULTATION", label: "Doctor consultation" },
  { value: "SERVICE_CHARGES", label: "Nursing / service charges" },
  { value: "LABORATORY", label: "Laboratory" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "OTHER_CHARGES", label: "Other charges" },
];

type ExtraItem = { key: string; description: string; category: string; amount: string };

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function rupeesToPaise(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

let keySeed = 0;

export default function DischargeForm({
  admissionId,
  patientName,
  patientUhid,
  admissionNo,
  ward,
  bedNumber,
  roomNo,
  days,
  dailyRatePaise,
  roomChargePaise,
  defaultDiagnosis,
}: {
  admissionId: string;
  patientName: string;
  patientUhid: string;
  admissionNo: string;
  ward: string;
  bedNumber: string;
  roomNo: string | null;
  days: number;
  dailyRatePaise: number;
  roomChargePaise: number;
  defaultDiagnosis: string;
}) {
  const router = useRouter();
  const [dischargeDate, setDischargeDate] = useState(todayInputValue());
  const [dischargeType, setDischargeType] = useState("IMPROVED");
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState(defaultDiagnosis);
  const [conditionAtDischarge, setConditionAtDischarge] = useState("");
  const [createInvoice, setCreateInvoice] = useState(true);
  const [items, setItems] = useState<ExtraItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extrasPaise = useMemo(
    () => items.reduce((sum, item) => sum + rupeesToPaise(item.amount), 0),
    [items],
  );
  const totalPaise = (createInvoice ? roomChargePaise : 0) + extrasPaise;

  function addItem() {
    keySeed += 1;
    setItems((current) => [
      ...current,
      { key: `item-${keySeed}`, description: "", category: "SERVICE_CHARGES", amount: "" },
    ]);
  }

  function updateItem(key: string, patch: Partial<ExtraItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dischargeSummary.trim()) {
      setError("Write the discharge summary");
      return;
    }
    if (items.some((item) => !item.description.trim())) {
      setError("Every extra charge needs a description");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ip/admissions/${admissionId}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dischargeDate: dischargeDate || null,
          dischargeType,
          dischargeSummary: dischargeSummary.trim(),
          finalDiagnosis: finalDiagnosis.trim() || null,
          conditionAtDischarge: conditionAtDischarge.trim() || null,
          createInvoice,
          billItems: items.map((item) => ({
            description: item.description.trim(),
            category: item.category,
            amountRupees: Number(item.amount) || 0,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to discharge the patient");
      router.push(`/ip/${admissionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discharge the patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Discharge summary</h2>
            <p className="card-subtitle">
              {patientName} · {patientUhid} · {admissionNo}
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="field-label">Discharge date</label>
                <input
                  type="date"
                  className="input w-full"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Discharge type</label>
                <select
                  className="input w-full"
                  value={dischargeType}
                  onChange={(e) => setDischargeType(e.target.value)}
                >
                  {DISCHARGE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">Final diagnosis</label>
              <input
                className="input w-full"
                value={finalDiagnosis}
                onChange={(e) => setFinalDiagnosis(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Discharge summary *</label>
              <textarea
                className="textarea"
                rows={6}
                value={dischargeSummary}
                onChange={(e) => setDischargeSummary(e.target.value)}
                placeholder="Presenting complaints, course in hospital, treatment given, investigations, advice on discharge…"
                required
              />
            </div>

            <div>
              <label className="field-label">Condition at discharge</label>
              <input
                className="input w-full"
                value={conditionAtDischarge}
                onChange={(e) => setConditionAtDischarge(e.target.value)}
                placeholder="e.g. stable, ambulatory, afebrile"
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="card-title">Discharge bill</h2>
              <p className="card-subtitle">
                Room charges are calculated on the server from the bed tariff
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-navy">
              <input
                type="checkbox"
                checked={createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
              />
              Raise IP invoice
            </label>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-navy">
                  {ward}
                  {roomNo ? ` · Room ${roomNo}` : ""} · Bed {bedNumber}
                </span>
                <span className="font-medium text-navy">
                  {formatINR(dailyRatePaise)} × {days} day{days === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-muted-foreground">
                <span>Accommodation subtotal</span>
                <span className="font-semibold text-navy">
                  {createInvoice ? formatINR(roomChargePaise) : "not billed"}
                </span>
              </div>
            </div>

            {items.map((item) => (
              <div key={item.key} className="grid items-end gap-2 md:grid-cols-12">
                <div className="md:col-span-4">
                  <label className="field-label text-xs">Description</label>
                  <input
                    className="input w-full"
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    placeholder="e.g. Nursing charges"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="field-label text-xs">Category</label>
                  <select
                    className="input w-full"
                    value={item.category}
                    onChange={(e) => updateItem(item.key, { category: e.target.value })}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="field-label text-xs">Amount (₹)</label>
                  <input
                    className="input w-full"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => updateItem(item.key, { amount: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm w-full"
                    onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add charge
            </button>
          </div>
        </section>
      </div>

      <aside className="card h-fit space-y-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bill preview
          </p>
          <p className="mt-1 text-2xl font-semibold text-navy">{formatINR(totalPaise)}</p>
          <p className="text-[11px] text-muted-foreground">
            {days} day{days === 1 ? "" : "s"} accommodation + {items.length} extra charge
            {items.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="space-y-1.5 border-t border-line pt-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Accommodation</span>
            <span className="text-navy">{createInvoice ? formatINR(roomChargePaise) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Extras</span>
            <span className="text-navy">{formatINR(extrasPaise)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
            <span className="text-navy">Total</span>
            <span className="text-navy">{formatINR(totalPaise)}</span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          The invoice is raised in the IP department and can be collected from Billing. The bed is
          freed on discharge.
        </p>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? "Discharging…" : "Discharge patient"}
        </button>
      </aside>
    </form>
  );
}
