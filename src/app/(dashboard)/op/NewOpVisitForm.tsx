"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type DoctorOption = { id: string; name: string };

export default function NewOpVisitForm({
  doctors,
}: {
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !doctorId) {
      setError("Please select both a patient and a doctor");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/op/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          doctorId,
          complaint: complaint.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to register OP visit");
      }
      setPatientId("");
      setSelectedPatient(null);
      setDoctorId("");
      setComplaint("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register OP visit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="card">
      <div className="card-header">
        <h2 className="card-title">New OP Visit</h2>
        <p className="card-subtitle">Register a walk-in or booked patient encounter</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="op-patient" className="field-label">
              Patient <span className="text-danger">*</span>
            </label>
            <PatientAutocomplete
              id="op-patient"
              selectedPatient={selectedPatient}
              onSelect={(p) => {
                setSelectedPatient(p);
                setPatientId(p?.id ?? "");
              }}
              required
            />
          </div>
          <div>
            <label htmlFor="op-doctor" className="field-label">
              Doctor <span className="text-danger">*</span>
            </label>
            <select
              id="op-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="input w-full"
              required
            >
              <option value="">Select a consulting doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="op-complaint" className="field-label">
            Presenting Complaint / Reason for visit
          </label>
          <input
            id="op-complaint"
            type="text"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="e.g. Fever for 3 days, headache, routine check-up…"
            className="input w-full"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Queue sequence is assigned automatically per department
          </p>
          <button
            type="submit"
            disabled={submitting || !patientId || !doctorId}
            className="btn btn-primary"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {submitting ? "Registering…" : "Register OP Visit"}
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </form>
    </aside>
  );
}
