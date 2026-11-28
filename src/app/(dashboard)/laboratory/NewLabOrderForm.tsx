"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type DoctorOption = { id: string; name: string };
type ServiceOption = {
  id: string;
  name: string;
  code: string;
  pricePaise: number;
  category?: string | null;
};

type PickedTest = {
  testName: string;
  testCode?: string;
  department?: string;
  sampleType?: string;
  priceRupees: number;
  templateId?: string | null;
};

const DEPARTMENTS = [
  "Haematology",
  "Biochemistry",
  "Serology",
  "Urine Analysis",
  "Cytology",
  "Parasitology",
  "Blood Bank",
  "Microbiology",
  "Histopathology",
  "Other",
];

export default function NewLabOrderForm({
  doctors,
  catalogServices = [],
}: {
  doctors: DoctorOption[];
  catalogServices?: ServiceOption[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [orderedById, setOrderedById] = useState("");
  const [picked, setPicked] = useState<PickedTest[]>([]);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("0");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT" | "STAT">("ROUTINE");
  const [sampleType, setSampleType] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [raiseInvoice, setRaiseInvoice] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const total = useMemo(
    () => picked.reduce((sum, test) => sum + test.priceRupees, 0),
    [picked],
  );

  function toggleService(service: ServiceOption) {
    setPicked((current) => {
      const exists = current.some((test) => test.testName === service.name);
      if (exists) return current.filter((test) => test.testName !== service.name);
      return [
        ...current,
        {
          testName: service.name,
          testCode: service.code,
          department: department || service.category || undefined,
          sampleType: sampleType || undefined,
          priceRupees: Math.round(service.pricePaise) / 100,
        },
      ];
    });
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if (picked.some((test) => test.testName.toLowerCase() === name.toLowerCase())) {
      setError("That test is already on this requisition");
      return;
    }
    setPicked((current) => [
      ...current,
      {
        testName: name,
        department: department || undefined,
        sampleType: sampleType || undefined,
        priceRupees: Number(customPrice) || 0,
      },
    ]);
    setCustomName("");
    setCustomPrice("0");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !orderedById || picked.length === 0) {
      setError("Select the patient, the ordering doctor and at least one test");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/laboratory/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          orderedById,
          tests: picked.map((test) => ({
            testName: test.testName,
            testCode: test.testCode,
            department: test.department,
            sampleType: test.sampleType,
            priceRupees: test.priceRupees,
          })),
          department: department || undefined,
          priority,
          sampleType: sampleType || undefined,
          sampleId: sampleId || undefined,
          raiseInvoice,
          notes: notes || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create lab requisition");
      }

      setSuccess(
        `Accession ${data.order?.orderNo ?? "created"}${
          data.order?.invoice?.invoiceNo ? ` · Invoice ${data.order.invoice.invoiceNo}` : ""
        }`,
      );
      setPatientId("");
      setSelectedPatient(null);
      setPicked([]);
      setSampleType("");
      setSampleId("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lab order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="card">
      <div className="card-header">
        <h2 className="card-title">Register Laboratory Investigation</h2>
        <p className="card-subtitle">
          One accession can carry several tests; the LAB invoice is raised in the same transaction.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="lab-patient" className="field-label">
              Patient <span className="text-danger">*</span>
            </label>
            <PatientAutocomplete
              id="lab-patient"
              selectedPatient={selectedPatient}
              onSelect={(p) => {
                setSelectedPatient(p);
                setPatientId(p?.id ?? "");
              }}
              required
            />
          </div>

          <div>
            <label htmlFor="lab-doctor" className="field-label">
              Ordering Physician <span className="text-danger">*</span>
            </label>
            <select
              id="lab-doctor"
              value={orderedById}
              onChange={(e) => setOrderedById(e.target.value)}
              className="input w-full"
              required
            >
              <option value="">Select doctor…</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="lab-department" className="field-label">
              Department
            </label>
            <select
              id="lab-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input w-full"
            >
              <option value="">Auto / not specified</option>
              {DEPARTMENTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lab-priority" className="field-label">
              Priority
            </label>
            <select
              id="lab-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as "ROUTINE" | "URGENT" | "STAT")}
              className="input w-full"
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="STAT">STAT</option>
            </select>
          </div>
          <div>
            <label htmlFor="lab-sample" className="field-label">
              Sample type
            </label>
            <input
              id="lab-sample"
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value)}
              placeholder="Whole blood, serum, urine…"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="lab-sample-id" className="field-label">
              Sample / vial ID
            </label>
            <input
              id="lab-sample-id"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              placeholder="Optional barcode"
              className="input w-full"
            />
          </div>
        </div>

        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy">
              Tests on this accession ({picked.length})
            </p>
            <p className="text-xs text-muted-foreground">
              Total ₹{total.toFixed(2)}
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto px-3 py-2">
            {catalogServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No lab services in the price list yet — add a custom test below.
              </p>
            ) : (
              <div className="grid gap-1.5 md:grid-cols-2">
                {catalogServices.map((service) => {
                  const checked = picked.some((test) => test.testName === service.name);
                  return (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                        checked ? "border-medical bg-info-bg/40" : "border-line hover:bg-page"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleService(service)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-medium text-navy">{service.name}</span>
                        <span className="text-[10px] text-muted-foreground">{service.code}</span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        ₹{(service.pricePaise / 100).toFixed(2)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-line px-3 py-2">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="custom-test" className="field-label">
                Other / custom test
              </label>
              <input
                id="custom-test"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. D-Dimer"
                className="input w-full"
              />
            </div>
            <div className="w-28">
              <label htmlFor="custom-price" className="field-label">
                Tariff (₹)
              </label>
              <input
                id="custom-price"
                type="number"
                min="0"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="input w-full"
              />
            </div>
            <button type="button" onClick={addCustom} className="btn btn-secondary btn-sm">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {picked.length > 0 ? (
            <ul className="divide-y divide-line border-t border-line">
              {picked.map((test) => (
                <li key={test.testName} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                  <span className="font-medium text-navy">{test.testName}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground">
                      ₹{test.priceRupees.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked((current) =>
                          current.filter((item) => item.testName !== test.testName),
                        )
                      }
                      className="text-muted-foreground hover:text-danger"
                      aria-label={`Remove ${test.testName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <label htmlFor="lab-notes" className="field-label">
            Clinical notes / instructions
          </label>
          <textarea
            id="lab-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="textarea"
            placeholder="Optional note for the laboratory"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-xs text-navy">
            <input
              type="checkbox"
              checked={raiseInvoice}
              onChange={(e) => setRaiseInvoice(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Raise a LAB invoice for ₹{total.toFixed(2)}
          </label>
          <button
            type="submit"
            disabled={submitting || !patientId || !orderedById || picked.length === 0}
            className="btn btn-primary"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {submitting ? "Registering…" : "Create Lab Requisition"}
          </button>
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {success ? <p className="text-xs text-success">{success}</p> : null}
      </form>
    </aside>
  );
}
