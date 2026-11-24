"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Loader2, Plus, Stethoscope, User, FileText } from "lucide-react";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

type PatientOption = { id: string; name: string; uhid: string };
type DoctorOption = { id: string; name: string };

export default function BookAppointmentForm({
  patients,
  doctors,
}: {
  patients: PatientOption[];
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !doctorId || !date) {
      setError("Please select patient, doctor, and appointment date.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const slot = `${date}T${time}:00Z`;
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          doctorId,
          slot,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to book appointment");
      }

      setPatientId("");
      setSelectedPatient(null);
      setDoctorId("");
      setNotes("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card overflow-hidden shadow-xs border border-slate-200">
      <div className="card-header border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-medical/10 p-2 text-medical">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h2 className="card-title text-sm font-bold text-navy">Book an Appointment</h2>
            <p className="card-subtitle text-xs text-muted-foreground">
              Schedule a consultation slot and assign sequential token for an existing patient
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-bg p-3 text-xs font-medium text-danger border border-red-200 animate-in fade-in">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-success-bg p-3 text-xs font-medium text-success border border-emerald-200 animate-in fade-in">
            Appointment booked successfully! Token sequence has been assigned.
          </div>
        )}

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="apt-patient" className="field-label flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Patient (Name or UHID) <span className="text-danger">*</span>
            </label>
            <div className="mt-1">
              <PatientAutocomplete
                id="apt-patient"
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
            <label htmlFor="apt-doctor" className="field-label flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Stethoscope className="h-3.5 w-3.5 text-slate-400" />
              Consulting Doctor <span className="text-danger">*</span>
            </label>
            <select
              id="apt-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="input mt-1 w-full text-xs"
              required
            >
              <option value="">-- Choose Doctor --</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="apt-date" className="field-label flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              Appointment Date <span className="text-danger">*</span>
            </label>
            <input
              id="apt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input mt-1 w-full text-xs"
              required
            />
          </div>

          <div>
            <label htmlFor="apt-time" className="field-label flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Slot Time <span className="text-danger">*</span>
            </label>
            <select
              id="apt-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input mt-1 w-full text-xs"
              required
            >
              <option value="09:00">09:00 AM</option>
              <option value="09:30">09:30 AM</option>
              <option value="10:00">10:00 AM</option>
              <option value="10:30">10:30 AM</option>
              <option value="11:00">11:00 AM</option>
              <option value="11:30">11:30 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="14:00">02:00 PM</option>
              <option value="14:30">02:30 PM</option>
              <option value="15:00">03:00 PM</option>
              <option value="15:30">03:30 PM</option>
              <option value="16:00">04:00 PM</option>
              <option value="16:30">04:30 PM</option>
              <option value="17:00">05:00 PM</option>
            </select>
          </div>

          <div>
            <label htmlFor="apt-notes" className="field-label flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              Consultation Reason / Notes
            </label>
            <input
              id="apt-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. General checkup, Routine follow-up"
              className="input mt-1 w-full text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-muted-foreground">
            Clinic hours: 09:00–17:30 · Sequential appointment tokens issued automatically
          </p>
          <button
            type="submit"
            disabled={submitting || !patientId || !doctorId || !date}
            className="btn btn-primary text-xs flex items-center gap-1.5 py-2 px-4 shadow-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {submitting ? "Booking Slot…" : "Confirm Appointment"}
          </button>
        </div>
      </form>
    </section>
  );
}
