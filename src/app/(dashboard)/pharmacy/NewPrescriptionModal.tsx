"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Pill } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

interface Patient {
  id: string;
  name: string;
  uhid: string;
}

interface Medicine {
  id: string;
  name: string;
  itemCode: string;
  stockQuantity: number;
  unitPricePaise: number;
  category: string;
}

export default function NewPrescriptionModal({
  patients,
  medicines,
}: {
  patients: Patient[];
  medicines: Medicine[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [prescribedBy, setPrescribedBy] = useState("");
  const [instructions, setInstructions] = useState("");

  const [items, setItems] = useState<
    Array<{ medicineId: string; quantity: number; dosage: string }>
  >([
    {
      medicineId: medicines[0]?.id || "",
      quantity: 1,
      dosage: "1-0-1 After food (5 days)",
    },
  ]);

  const addItem = () => {
    setItems([
      ...items,
      {
        medicineId: medicines[0]?.id || "",
        quantity: 1,
        dosage: "1-0-1 After food",
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  // Calculate estimated total
  const totalRupees = items.reduce((sum, it) => {
    const med = medicines.find((m) => m.id === it.medicineId);
    if (!med) return sum;
    return sum + (med.unitPricePaise / 100) * it.quantity;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      setError("Please select a patient");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one medicine item");
      return;
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
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to create prescription");
      }

      setOpen(false);
      setPatientId("");
      setSelectedPatient(null);
      setPrescribedBy("");
      setInstructions("");
      setItems([
        {
          medicineId: medicines[0]?.id || "",
          quantity: 1,
          dosage: "1-0-1 After food",
        },
      ]);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
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
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-teal-50 dark:bg-teal-950 p-2 text-teal-600 dark:text-teal-400">
                  <Pill className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-navy dark:text-slate-100">
                    Write Doctor Prescription
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Assign medications, dosages, and queue for pharmacy dispensing
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-danger-bg p-3 text-sm text-danger border border-red-200">
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
                      initialPatients={patients as PatientSearchResult[]}
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

              {/* Medicine Line Items */}
              <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-800/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Prescribed Medications ({items.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Another Medicine
                  </button>
                </div>

                {items.map((it, idx) => {
                  const selMed = medicines.find((m) => m.id === it.medicineId);
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-end bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <div className="col-span-5">
                        <label className="text-[11px] text-slate-500">Medicine</label>
                        <select
                          value={it.medicineId}
                          onChange={(e) => updateItem(idx, "medicineId", e.target.value)}
                          className="input mt-0.5 w-full text-xs"
                        >
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.stockQuantity} in stock) - ₹{(m.unitPricePaise / 100).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="text-[11px] text-slate-500">Qty</label>
                        <input
                          type="number"
                          min="1"
                          max={selMed?.stockQuantity || 999}
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="input mt-0.5 w-full text-xs"
                        />
                      </div>

                      <div className="col-span-4">
                        <label className="text-[11px] text-slate-500">Dosage Instructions</label>
                        <input
                          type="text"
                          placeholder="e.g. 1-0-1 after food"
                          value={it.dosage}
                          onChange={(e) => updateItem(idx, "dosage", e.target.value)}
                          className="input mt-0.5 w-full text-xs"
                        />
                      </div>

                      <div className="col-span-1 flex justify-center pb-1">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-slate-400 hover:text-danger"
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between items-center pt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Estimated Total Amount:</span>
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-secondary text-sm"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary text-sm"
                >
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
