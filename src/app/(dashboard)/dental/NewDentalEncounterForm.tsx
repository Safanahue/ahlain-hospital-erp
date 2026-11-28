"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type PatientOption = { id: string; name: string; uhid: string };
type DentistOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; code: string; pricePaise: number };

const DEFAULT_PROCEDURES = [
  { name: "Root Canal Treatment (RCT)", fee: 2200 },
  { name: "Dental Scaling & Polishing", fee: 800 },
  { name: "Dental Consultation & Examination", fee: 300 },
  { name: "Composite Tooth Restoration / Filling", fee: 1200 },
  { name: "Simple Tooth Extraction", fee: 600 },
  { name: "Surgical Wisdom Tooth Removal", fee: 2500 },
  { name: "Dental Crown / Cap Fitting", fee: 3500 },
  { name: "Orthodontic Assessment", fee: 500 },
];

export default function NewDentalEncounterForm({
  dentists,
  catalogServices = [],
}: {
  dentists: DentistOption[];
  catalogServices?: ServiceOption[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [dentistId, setDentistId] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PROCEDURES[0].name);
  const [customProcedure, setCustomProcedure] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [toothNumber, setToothNumber] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [costRupees, setCostRupees] = useState(String(DEFAULT_PROCEDURES[0].fee));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combine default list and master Service Catalog procedures
  const procedureOptions = [
    ...DEFAULT_PROCEDURES.map((p) => ({ name: p.name, fee: p.fee })),
    ...catalogServices
      .filter((s) => !DEFAULT_PROCEDURES.some((dp) => dp.name.toLowerCase() === s.name.toLowerCase()))
      .map((s) => ({ name: s.name, fee: s.pricePaise / 100 })),
  ];

  function handleProcedureSelect(name: string) {
    setSelectedPreset(name);
    if (name === "__CUSTOM__") {
      setIsCustom(true);
      setCustomProcedure("");
    } else {
      setIsCustom(false);
      const matched = procedureOptions.find((p) => p.name === name);
      if (matched) {
        setCostRupees(String(matched.fee));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalProcedure = isCustom ? customProcedure.trim() : selectedPreset;

    if (!patientId || !dentistId || !finalProcedure) {
      setError("Please select a patient, dentist, and enter the procedure name");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dental/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          dentistId,
          procedureName: finalProcedure,
          toothNumber: toothNumber.trim() || undefined,
          chiefComplaint: chiefComplaint.trim() || undefined,
          clinicalNotes: clinicalNotes.trim() || undefined,
          costRupees: Number(costRupees) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save dental record");
      }

      setPatientId("");
      setSelectedPatient(null);
      setToothNumber("");
      setChiefComplaint("");
      setClinicalNotes("");
      if (isCustom) {
        setIsCustom(false);
        setSelectedPreset(DEFAULT_PROCEDURES[0].name);
        setCostRupees(String(DEFAULT_PROCEDURES[0].fee));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dental record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="card">
      <div className="card-header">
        <h2 className="card-title">New Dental Procedure Encounter</h2>
        <p className="card-subtitle">Record oral diagnosis, tooth chart notation, and procedure tariffs</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dental-patient" className="field-label">
              Patient <span className="text-danger">*</span>
            </label>
            <PatientAutocomplete
              id="dental-patient"
              selectedPatient={selectedPatient}
              onSelect={(p) => {
                setSelectedPatient(p);
                setPatientId(p?.id ?? "");
              }}
              required
            />
          </div>

          <div>
            <label htmlFor="dental-dentist" className="field-label">
              Dentist / Specialist <span className="text-danger">*</span>
            </label>
            <select
              id="dental-dentist"
              value={dentistId}
              onChange={(e) => setDentistId(e.target.value)}
              className="input w-full"
              required
            >
              <option value="">Select consulting dentist…</option>
              {dentists.map((d) => (
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
              <label htmlFor="dental-procedure-select" className="field-label">
                Procedure Name <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const nextCustom = !isCustom;
                  setIsCustom(nextCustom);
                  if (nextCustom) {
                    setSelectedPreset("__CUSTOM__");
                  } else {
                    setSelectedPreset(DEFAULT_PROCEDURES[0].name);
                    setCostRupees(String(DEFAULT_PROCEDURES[0].fee));
                  }
                }}
                className="text-[11px] text-medical font-medium hover:underline"
              >
                {isCustom ? "← Pick from preset list" : "+ Type custom procedure"}
              </button>
            </div>

            {isCustom ? (
              <input
                id="dental-procedure-custom"
                type="text"
                autoFocus
                value={customProcedure}
                onChange={(e) => setCustomProcedure(e.target.value)}
                placeholder="Type new procedure name…"
                className="input w-full"
                required
              />
            ) : (
              <select
                id="dental-procedure-select"
                value={selectedPreset}
                onChange={(e) => handleProcedureSelect(e.target.value)}
                className="input w-full"
              >
                {procedureOptions.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Other / Enter Custom Procedure…</option>
              </select>
            )}
          </div>

          <div>
            <label htmlFor="dental-tooth" className="field-label">
              Tooth No / Quadrant (FDI / Universal)
            </label>
            <input
              id="dental-tooth"
              type="text"
              value={toothNumber}
              onChange={(e) => setToothNumber(e.target.value)}
              placeholder="e.g. 18, 46, Upper Right Molar"
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="dental-cost" className="field-label">
              Fee (₹)
            </label>
            <input
              id="dental-cost"
              type="number"
              min="0"
              value={costRupees}
              onChange={(e) => setCostRupees(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dental-complaint" className="field-label">
              Chief Dental Complaint
            </label>
            <input
              id="dental-complaint"
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g. Pain on chewing, bleeding gums, tooth sensitivity"
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="dental-notes" className="field-label">
              Clinical Findings & Treatment Plan
            </label>
            <input
              id="dental-notes"
              type="text"
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="e.g. Deep caries, advised root canal and crown"
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Sequential case number is generated automatically (AH-DENT-2026-XXXX)
          </p>
          <button
            type="submit"
            disabled={submitting || !patientId || !dentistId}
            className="btn btn-primary"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {submitting ? "Saving…" : "Log Dental Encounter"}
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </form>
    </aside>
  );
}
