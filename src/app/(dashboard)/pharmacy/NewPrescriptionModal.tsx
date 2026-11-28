"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Pill, Search, AlertCircle } from "lucide-react";
import PatientAutocomplete, {
  type PatientSearchResult,
} from "@/modules/patients/components/PatientAutocomplete";

type PickedMedicine = {
  id: string;
  name: string;
  itemCode: string;
  category: string;
  stockQuantity: number;
  unitPricePaise: number;
};

type RxLine = {
  medicineId: string;
  name: string;
  stock: number;
  unitPricePaise: number;
  quantity: number;
  dosage: string;
};

function emptyLine(): RxLine {
  return {
    medicineId: "",
    name: "",
    stock: 0,
    unitPricePaise: 0,
    quantity: 1,
    dosage: "",
  };
}

function MedicineSearch({
  onPick,
  disabled,
}: {
  onPick: (medicine: PickedMedicine) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open) return;

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/pharmacy/medicines?view=picker&q=${encodeURIComponent(term)}`,
        );
        const data = await res.json();
        setResults(res.ok ? (data.items ?? []) : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term, open]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          className="input w-full pl-8 text-xs"
          placeholder="Search medicine by name or item code..."
          value={term}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No medicine found. Add it to the catalogue first.
            </p>
          ) : (
            results.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  onPick(medicine);
                  setTerm("");
                  setOpen(false);
                }}
              >
                <span>
                  <span className="block font-medium text-slate-800 dark:text-slate-100">
                    {medicine.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {medicine.itemCode}
                  </span>
                </span>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  {medicine.stockQuantity} in stock · ₹
                  {(medicine.unitPricePaise / 100).toFixed(2)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function NewPrescriptionModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [prescribedBy, setPrescribedBy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [items, setItems] = useState<RxLine[]>([emptyLine()]);

  const reset = () => {
    setPatientId("");
    setSelectedPatient(null);
    setPrescribedBy("");
    setInstructions("");
    setItems([emptyLine()]);
    setError(null);
  };

  const updateLine = (index: number, patch: Partial<RxLine>) => {
    setItems((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };

  const totalRupees = items.reduce(
    (sum, line) => sum + (line.unitPricePaise / 100) * (line.quantity || 0),
    0,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientId) return setError("Select a patient");
    if (items.some((line) => !line.medicineId)) {
      return setError("Add at least one medicine to the prescription");
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pharmacy/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          prescribedBy,
          instructions,
          items: items.map((line) => ({
            medicineId: line.medicineId,
            quantity: line.quantity,
            dosage: line.dosage,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create prescription");

      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-primary flex items-center gap-2 text-sm"
      >
        <Plus className="h-4 w-4" />
        New Prescription
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                  <Pill className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-navy dark:text-slate-100">
                    Write Doctor Prescription
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Queue medicines for the pharmacy counter — stock is deducted when they are dispensed
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-danger-bg p-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Patient (UHID) *
                  </label>
                  <div className="mt-1">
                    <PatientAutocomplete
                      id="rx-patient"
                      selectedPatient={selectedPatient}
                      onSelect={(p) => {
                        setSelectedPatient(p);
                        setPatientId(p?.id ?? "");
                      }}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Prescribing Doctor
                  </label>
                  <input
                    type="text"
                    placeholder="Dr. Name"
                    value={prescribedBy}
                    onChange={(e) => setPrescribedBy(e.target.value)}
                    className="input mt-1 w-full text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Prescribed Medications ({items.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setItems((current) => [...current, emptyLine()])}
                    className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Another Medicine
                  </button>
                </div>

                {items.map((line, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="grid grid-cols-12 items-end gap-2">
                      <div className="col-span-7">
                        <label className="text-[11px] text-slate-500">Medicine</label>
                        {line.medicineId ? (
                          <div className="mt-0.5 flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
                            <span className="font-medium">{line.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {line.stock} in stock
                            </span>
                          </div>
                        ) : (
                          <div className="mt-0.5">
                            <MedicineSearch
                              onPick={(medicine) =>
                                updateLine(index, {
                                  medicineId: medicine.id,
                                  name: medicine.name,
                                  stock: medicine.stockQuantity,
                                  unitPricePaise: medicine.unitPricePaise,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div className="col-span-2">
                        <label className="text-[11px] text-slate-500">Qty</label>
                        <input
                          type="number"
                          min="1"
                          max={line.stock || undefined}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(index, {
                              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          className="input mt-0.5 w-full text-xs"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="text-[11px] text-slate-500">Dosage</label>
                        <input
                          type="text"
                          placeholder="1-0-1 after food"
                          value={line.dosage}
                          onChange={(e) => updateLine(index, { dosage: e.target.value })}
                          className="input mt-0.5 w-full text-xs"
                        />
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {line.stock > 0 && line.quantity > line.stock
                          ? `Only ${line.stock} in stock — reduce the quantity or the dispense will be blocked`
                          : `Line amount: ₹${(
                              (line.unitPricePaise / 100) *
                              (line.quantity || 0)
                            ).toFixed(2)}`}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((current) => current.filter((_, i) => i !== index))
                          }
                          className="text-slate-400 hover:text-danger"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Estimated total amount:</span>
                  <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                    ₹{totalRupees.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Pharmacist / Patient Special Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Review after 5 days, keep refrigerated, avoid dairy"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="input mt-1 w-full text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-secondary text-sm"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-sm" disabled={loading}>
                  {loading ? "Creating..." : "Issue Prescription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
