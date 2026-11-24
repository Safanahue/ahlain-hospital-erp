"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Plus } from "lucide-react";
import { formatINR } from "@/modules/shared/money";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type PatientOption = {
  id: string;
  name: string;
  uhid: string;
  age: number;
  gender: string;
};

type DoctorOption = { id: string; name: string };

type BedOption = {
  id: string;
  bedNumber: string;
  ward: string;
  roomNo: string | null;
  floor: string | null;
  dailyRatePaise: number;
};

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function NewAdmissionForm({
  patients,
  doctors,
  beds,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
  beds: BedOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [admittingDoctorId, setAdmittingDoctorId] = useState("");
  const [attendingDoctorId, setAttendingDoctorId] = useState("");
  const [bedId, setBedId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [admissionDate, setAdmissionDate] = useState(todayInputValue());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bedsByWard = useMemo(() => {
    const groups = new Map<string, BedOption[]>();
    for (const bed of beds) {
      groups.set(bed.ward, [...(groups.get(bed.ward) ?? []), bed]);
    }
    return [...groups.entries()];
  }, [beds]);

  const selectedBed = beds.find((bed) => bed.id === bedId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !admittingDoctorId || !bedId || !diagnosis.trim()) {
      setError("Patient, admitting doctor, bed and diagnosis are required");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ip/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          admittingDoctorId,
          attendingDoctorId: attendingDoctorId || null,
          bedId,
          diagnosis: diagnosis.trim(),
          admissionDate: admissionDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to admit the patient");

      setPatientId("");
      setSelectedPatient(null);
      setAdmittingDoctorId("");
      setAttendingDoctorId("");
      setBedId("");
      setDiagnosis("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to admit the patient");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="card-title">New IP admission</h2>
          <p className="card-subtitle">
            Allocate a ward bed, assign the treating doctor and generate a unique IP number
          </p>
        </div>
        <button
          type="button"
          className={open ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            "Close form"
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden />
              Admit patient
            </>
          )}
        </button>
      </div>

      {open ? (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-line px-5 py-4">
          {beds.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
              No beds are available. Add wards and beds under “Wards, rooms &amp; beds” first.
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="field-label">Patient *</label>
              <PatientAutocomplete
                id="ip-patient"
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
              <label className="field-label">Admitting doctor *</label>
              <select
                className="input w-full"
                value={admittingDoctorId}
                onChange={(e) => setAdmittingDoctorId(e.target.value)}
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

            <div>
              <label className="field-label">Attending doctor</label>
              <select
                className="input w-full"
                value={attendingDoctorId}
                onChange={(e) => setAttendingDoctorId(e.target.value)}
              >
                <option value="">Same as admitting doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="field-label">Ward / room / bed *</label>
              <select
                className="input w-full"
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                required
              >
                <option value="">Select an available bed…</option>
                {bedsByWard.map(([ward, wardBeds]) => (
                  <optgroup key={ward} label={ward}>
                    {wardBeds.map((bed) => (
                      <option key={bed.id} value={bed.id}>
                        {bed.roomNo ? `Room ${bed.roomNo} · ` : ""}
                        {bed.bedNumber} · {formatINR(bed.dailyRatePaise)}/day
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedBed ? (
                <p className="field-help">
                  <BedDouble className="mr-1 inline h-3 w-3" aria-hidden />
                  {selectedBed.ward}
                  {selectedBed.floor ? ` · ${selectedBed.floor}` : ""} · tariff{" "}
                  {formatINR(selectedBed.dailyRatePaise)}/day
                </p>
              ) : null}
            </div>

            <div>
              <label className="field-label">Admission date</label>
              <input
                type="date"
                className="input w-full"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Provisional diagnosis *</label>
              <input
                className="input w-full"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="Reason for admission"
                required
              />
            </div>
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || beds.length === 0}
            >
              {submitting ? "Admitting…" : "Admit patient"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
