"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, X, AlertCircle, History } from "lucide-react";

export interface StockMedicine {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  batchNumber: string;
  expiryDate: string;
  stockQuantity: number;
  unitPricePaise: number;
}

type Movement = {
  id: string;
  createdAt: string;
  action: string;
  user: string | null;
  delta: number;
  before: number | null;
  after: number | null;
  reason: string | null;
  batchNumber: string | null;
};

const KINDS = [
  { value: "RECEIPT", label: "Stock receipt (purchase / delivery)", sign: "+" },
  { value: "RETURN", label: "Customer return", sign: "+" },
  { value: "ISSUE", label: "Issue / write-off (damage, expiry)", sign: "−" },
  { value: "ADJUSTMENT", label: "Adjustment (stock count correction)", sign: "−" },
] as const;

const ACTION_LABELS: Record<string, string> = {
  MEDICINE_CREATED: "Item created",
  MEDICINE_STOCK_RECEIPT: "Stock received",
  MEDICINE_STOCK_RETURN: "Returned to stock",
  MEDICINE_STOCK_ISSUE: "Issued / written off",
  MEDICINE_STOCK_ADJUSTMENT: "Adjusted",
  MEDICINE_STOCK_DEDUCTED: "Dispensed",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StockActionsModal({ medicine }: { medicine: StockMedicine }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"move" | "history">("move");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [form, setForm] = useState({
    kind: "RECEIPT" as (typeof KINDS)[number]["value"],
    quantity: 1,
    reason: "",
    batchNumber: medicine.batchNumber,
    expiryDate: medicine.expiryDate.slice(0, 10),
    unitPriceRupees: medicine.unitPricePaise / 100,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pharmacy/medicines/${medicine.id}/stock`);
        const data = await res.json();
        if (!cancelled && res.ok) setMovements(data.movements ?? []);
      } catch {
        /* history is informational; ignore a failed load */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, medicine.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pharmacy/medicines/${medicine.id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record the stock movement");
      setMovements(data.movements ?? []);
      setForm((prev) => ({ ...prev, quantity: 1, reason: "" }));
      setTab("history");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const increase = form.kind === "RECEIPT" || form.kind === "RETURN";
  const projected = increase
    ? medicine.stockQuantity + (Number(form.quantity) || 0)
    : medicine.stockQuantity - (Number(form.quantity) || 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
        title="Receive or adjust stock, and see the movement history"
      >
        <Boxes className="h-3.5 w-3.5" />
        Stock
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold text-navy dark:text-slate-100">
                  {medicine.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {medicine.itemCode} · Batch {medicine.batchNumber} · Stock{" "}
                  <strong>{medicine.stockQuantity} units</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex gap-2 border-b border-slate-100 pb-2 text-sm dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTab("move")}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  tab === "move" ? "bg-teal-50 text-teal-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Record movement
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${
                  tab === "history" ? "bg-teal-50 text-teal-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <History className="h-4 w-4" /> History ({movements.length})
              </button>
            </div>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-danger-bg p-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {tab === "move" ? (
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div>
                  <label className="field-label" htmlFor="kind">
                    Movement type
                  </label>
                  <select
                    id="kind"
                    className="input w-full"
                    value={form.kind}
                    onChange={(e) =>
                      setForm({ ...form, kind: e.target.value as typeof form.kind })
                    }
                  >
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label" htmlFor="quantity">
                      Quantity ({increase ? "added" : "removed"})
                    </label>
                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      className="input w-full"
                      value={form.quantity}
                      onChange={(e) =>
                        setForm({ ...form, quantity: Number(e.target.value) })
                      }
                    />
                    <p
                      className={`mt-1 text-xs ${
                        projected < 0 ? "text-danger" : "text-muted-foreground"
                      }`}
                    >
                      Stock after this movement: {projected} units
                    </p>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="unitPrice">
                      Unit price (₹)
                    </label>
                    <input
                      id="unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-full"
                      value={form.unitPriceRupees}
                      onChange={(e) =>
                        setForm({ ...form, unitPriceRupees: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label" htmlFor="batch">
                      Batch number
                    </label>
                    <input
                      id="batch"
                      className="input w-full"
                      value={form.batchNumber}
                      onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="expiry">
                      Expiry date
                    </label>
                    <input
                      id="expiry"
                      type="date"
                      className="input w-full"
                      value={form.expiryDate}
                      onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="reason">
                    Reason (required, kept in the stock history)
                  </label>
                  <input
                    id="reason"
                    className="input w-full"
                    placeholder="e.g. Purchase invoice 8842 from MedPlus, or stock count correction"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    required
                    minLength={3}
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                  >
                    Close
                  </button>
                  <button type="submit" className="btn btn-primary text-sm" disabled={loading}>
                    {loading ? "Saving..." : "Record movement"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 max-h-80 overflow-y-auto">
                {movements.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No stock movements recorded for this item yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {movements.map((move) => (
                      <li key={move.id} className="py-2.5 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-navy dark:text-slate-200">
                            {ACTION_LABELS[move.action] ?? move.action}
                          </span>
                          <span
                            className={`font-semibold ${
                              move.delta >= 0 ? "text-success" : "text-danger"
                            }`}
                          >
                            {move.delta >= 0 ? "+" : ""}
                            {move.delta} units
                          </span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {formatDateTime(move.createdAt)} · {move.user ?? "system"}
                          {move.after !== null ? ` · stock after: ${move.after}` : ""}
                        </div>
                        {move.reason && <div className="mt-0.5 italic">{move.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
