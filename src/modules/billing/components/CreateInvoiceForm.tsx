"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { rupeesToPaise, formatINR } from "@/modules/shared/money";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

const DEPARTMENTS = [
  { value: "OP", label: "OP" },
  { value: "IP", label: "IP" },
  { value: "LAB", label: "Lab" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "DENTAL", label: "Dental" },
];

const BILL_TYPES = [
  { value: "GENERAL", label: "General" },
  { value: "PACKAGE", label: "Package" },
  { value: "INSURANCE", label: "Insurance" },
];

const CATEGORIES = [
  { value: "SERVICE_CHARGES", label: "Service Charges" },
  { value: "LABORATORY", label: "Laboratory" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "ROOM_CHARGES", label: "Room Charges" },
  { value: "DOCTOR_CONSULTATION", label: "Doctor Consultation" },
  { value: "OTHER_CHARGES", label: "Other Charges" },
];

type Patient = { id: string; name: string; uhid: string; phone: string };
type ItemRow = { key: number; category: string; description: string; amount: string };

export default function CreateInvoiceForm({
  patients,
}: {
  patients: Patient[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(() => {
    const found = patients[0];
    return null;
  });
  const [department, setDepartment] = useState("OP");
  const [billType, setBillType] = useState("GENERAL");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, category: "SERVICE_CHARGES", description: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const totalPaise = items.reduce((sum, row) => sum + (rupeesToPaise(row.amount) ?? 0), 0);

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (!patientId) {
      setError("Select a patient.");
      return;
    }
    const payloadItems = items.map((row) => ({
      category: row.category,
      description: row.description.trim(),
      amount: rupeesToPaise(row.amount),
    }));
    if (payloadItems.some((item) => !item.description)) {
      setError("Every line item needs a description.");
      return;
    }
    if (payloadItems.some((item) => item.amount === null || item.amount! <= 0)) {
      setError("Every line item needs an amount greater than zero.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          department,
          billType,
          items: payloadItems.map((item) => ({
            ...item,
            amount: item.amount as number,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const firstIssue = data.details ? Object.values(data.details).flat()[0] : null;
        setError((firstIssue as string) ?? data.error ?? "Could not create invoice.");
        setPending(false);
        return;
      }
      router.push(`/billing/invoices/${data.invoice.id}`);
      router.refresh();
    } catch {
      setError("Network error — invoice was not created.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">New invoice</h2>
          <p className="card-subtitle">
            The total is recomputed on the server from the line items.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 px-5 py-4">
          <div className="col-span-3">
            <label htmlFor="patientId" className="field-label">
              Patient <span className="text-danger">*</span>
            </label>
            <PatientAutocomplete
              id="patientId"
              selectedPatient={selectedPatient}
              initialPatients={patients}
              onSelect={(p) => {
                setSelectedPatient(p);
                setPatientId(p?.id ?? "");
              }}
              required
            />
          </div>

          <div>
            <label htmlFor="department" className="field-label">
              Department
            </label>
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input w-full"
            >
              {DEPARTMENTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="billType" className="field-label">
              Bill type
            </label>
            <select
              id="billType"
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
              className="input w-full"
            >
              {BILL_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="card-title">Line items</h2>
          <button
            type="button"
            onClick={() =>
              setItems((rows) => [
                ...rows,
                {
                  key: Math.max(...rows.map((r) => r.key)) + 1,
                  category: "SERVICE_CHARGES",
                  description: "",
                  amount: "",
                },
              ])
            }
            className="btn btn-secondary btn-sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add item
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {items.map((row) => (
            <div key={row.key} className="grid grid-cols-[190px_1fr_140px_40px] gap-3">
              <select
                aria-label="Category"
                value={row.category}
                onChange={(e) => updateRow(row.key, { category: e.target.value })}
                className="input"
              >
                {CATEGORIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Description"
                value={row.description}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
                placeholder="Description"
                className="input"
              />
              <input
                aria-label="Amount in rupees"
                value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                placeholder="Amount ₹"
                inputMode="decimal"
                className="input"
              />
              <button
                type="button"
                aria-label="Remove item"
                disabled={items.length === 1}
                onClick={() =>
                  setItems((rows) => rows.filter((r) => r.key !== row.key))
                }
                className="flex h-[38px] items-center justify-center rounded-md border border-line text-danger hover:bg-danger-bg disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Amounts are entered in rupees and stored as paise.
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Total:{" "}
              <span className="text-base font-semibold text-navy">
                {formatINR(totalPaise)}
              </span>
            </p>
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create invoice
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
