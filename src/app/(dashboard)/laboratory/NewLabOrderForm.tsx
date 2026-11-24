"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type PatientOption = { id: string; name: string; uhid: string };
type DoctorOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; code: string; pricePaise: number };

const DEFAULT_LAB_TESTS = [
  { name: "Full Blood Count (FBC / CBC)", sample: "Whole Blood (EDTA)", fee: 250 },
  { name: "Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)", sample: "Serum (Fasting)", fee: 450 },
  { name: "Liver Function Test (LFT)", sample: "Serum", fee: 550 },
  { name: "Renal / Kidney Function Test (RFT / KFT)", sample: "Serum", fee: 450 },
  { name: "Thyroid Profile (T3, T4, TSH)", sample: "Serum", fee: 600 },
  { name: "Fasting Blood Sugar (FBS) & HbA1c", sample: "Fluoride Plasma & Whole Blood", fee: 350 },
  { name: "Routine Urine Examination & Microscopy", sample: "Clean Catch Midstream Urine", fee: 150 },
  { name: "Serum Electrolytes (Na+, K+, Cl-)", sample: "Serum", fee: 400 },
  { name: "Blood Grouping & Rh Typing", sample: "Whole Blood", fee: 100 },
];

export default function NewLabOrderForm({
  patients,
  doctors,
  catalogServices = [],
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  catalogServices?: ServiceOption[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [orderedById, setOrderedById] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_LAB_TESTS[0].name);
  const [customTest, setCustomTest] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [sampleType, setSampleType] = useState(DEFAULT_LAB_TESTS[0].sample);
  const [costRupees, setCostRupees] = useState(String(DEFAULT_LAB_TESTS[0].fee));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testOptions = [
    ...DEFAULT_LAB_TESTS.map((t) => ({ name: t.name, sample: t.sample, fee: t.fee })),
    ...catalogServices
      .filter((s) => !DEFAULT_LAB_TESTS.some((dt) => dt.name.toLowerCase() === s.name.toLowerCase()))
      .map((s) => ({ name: s.name, sample: "Serum / Blood", fee: s.pricePaise / 100 })),
  ];

  function handleTestSelect(name: string) {
    setSelectedPreset(name);
    if (name === "__CUSTOM__") {
      setIsCustom(true);
      setCustomTest("");
    } else {
      setIsCustom(false);
      const matched = testOptions.find((t) => t.name === name);
      if (matched) {
        setSampleType(matched.sample);
        setCostRupees(String(matched.fee));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalTest = isCustom ? customTest.trim() : selectedPreset;

    if (!patientId || !orderedById || !finalTest) {
      setError("Please select patient, doctor, and test name");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/laboratory/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          orderedById,
          testName: finalTest,
          sampleType: sampleType.trim() || undefined,
          costRupees: Number(costRupees) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create lab requisition");
      }

      setPatientId("");
      setSelectedPatient(null);
      if (isCustom) {
        setIsCustom(false);
        setSelectedPreset(DEFAULT_LAB_TESTS[0].name);
        setSampleType(DEFAULT_LAB_TESTS[0].sample);
        setCostRupees(String(DEFAULT_LAB_TESTS[0].fee));
      }
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
        <h2 className="card-title">Order Laboratory Investigation</h2>
        <p className="card-subtitle">Create patient lab order, specify specimen, and allocate accession sequence</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="lab-patient" className="field-label">
              Patient <span className="text-danger">*</span>
            </label>
            <PatientAutocomplete
              id="lab-patient"
              selectedPatient={selectedPatient}
              initialPatients={patients as PatientSearchResult[]}
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
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="lab-test-select" className="field-label">
                Test / Panel <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const nextCustom = !isCustom;
                  setIsCustom(nextCustom);
                  if (nextCustom) {
                    setSelectedPreset("__CUSTOM__");
                  } else {
                    setSelectedPreset(DEFAULT_LAB_TESTS[0].name);
                    setSampleType(DEFAULT_LAB_TESTS[0].sample);
                    setCostRupees(String(DEFAULT_LAB_TESTS[0].fee));
                  }
                }}
                className="text-[11px] text-medical font-medium hover:underline"
              >
                {isCustom ? "← Presets list" : "+ Custom test"}
              </button>
            </div>

            {isCustom ? (
              <input
                id="lab-test-custom"
                type="text"
                autoFocus
                value={customTest}
                onChange={(e) => setCustomTest(e.target.value)}
                placeholder="Type test name e.g. D-Dimer, Troponin-I"
                className="input w-full"
                required
              />
            ) : (
              <select
                id="lab-test-select"
                value={selectedPreset}
                onChange={(e) => handleTestSelect(e.target.value)}
                className="input w-full"
              >
                {testOptions.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Other / Enter Custom Investigation…</option>
              </select>
            )}
          </div>

          <div>
            <label htmlFor="lab-sample" className="field-label">
              Sample / Specimen Type
            </label>
            <input
              id="lab-sample"
              type="text"
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value)}
              placeholder="e.g. Whole Blood, Serum, Urine"
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="lab-cost" className="field-label">
              Standard Tariff (₹)
            </label>
            <input
              id="lab-cost"
              type="number"
              min="0"
              value={costRupees}
              onChange={(e) => setCostRupees(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Sequential lab accession number generated automatically (AH-LAB-2026-XXXX)
          </p>
          <button
            type="submit"
            disabled={submitting || !patientId || !orderedById}
            className="btn btn-primary"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {submitting ? "Ordering…" : "Create Lab Requisition"}
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </form>
    </aside>
  );
}
