"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, Pencil, X } from "lucide-react";
import { formatINR } from "@/modules/shared/money";

type DoctorOption = { id: string; name: string };
type BedOption = {
  id: string;
  bedNumber: string;
  ward: string;
  roomNo: string | null;
  floor: string | null;
  dailyRatePaise: number;
};

export default function AdmissionActions({
  admissionId,
  doctors,
  currentDoctorId,
  beds,
  canDischarge,
}: {
  admissionId: string;
  doctors: DoctorOption[];
  currentDoctorId: string | null;
  beds: BedOption[];
  canDischarge: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [doctorId, setDoctorId] = useState(currentDoctorId ?? "");
  const [transferOpen, setTransferOpen] = useState(false);
  const [toBedId, setToBedId] = useState("");
  const [reason, setReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [treatment, setTreatment] = useState("");

  async function request(url: string, method: string, body: unknown) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function saveDoctor() {
    try {
      await request(`/api/ip/admissions/${admissionId}`, "PATCH", {
        attendingDoctorId: doctorId || null,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign the doctor");
    }
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!toBedId) {
      setError("Select the destination bed");
      return;
    }
    try {
      await request(`/api/ip/admissions/${admissionId}/transfer`, "POST", {
        toBedId,
        reason: reason.trim() || null,
      });
      setTransferOpen(false);
      setToBedId("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer the patient");
    }
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError("Write the progress note");
      return;
    }
    try {
      await request(`/api/ip/admissions/${admissionId}/progress-notes`, "POST", {
        note: note.trim(),
        treatment: treatment.trim() || null,
      });
      setNoteOpen(false);
      setNote("");
      setTreatment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the progress note");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <select
            className="input h-[30px] text-xs"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            aria-label="Attending doctor"
          >
            <option value="">Unassigned</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={loading}
            onClick={saveDoctor}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Assign doctor
          </button>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setError(null);
            setTransferOpen(true);
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          Transfer bed
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setError(null);
            setNoteOpen(true);
          }}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden />
          Add progress note
        </button>

        {canDischarge ? (
          <Link href={`/ip/${admissionId}/discharge`} className="btn btn-primary btn-sm">
            Discharge &amp; bill
          </Link>
        ) : null}
      </div>

      {error && !transferOpen && !noteOpen ? (
        <p className="mt-2 w-full text-xs text-danger">{error}</p>
      ) : null}

      {transferOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-navy">Transfer to another bed</h3>
                <p className="text-xs text-muted-foreground">
                  The current bed is freed automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-page"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitTransfer} className="mt-4 space-y-3">
              <div>
                <label className="field-label">Destination bed *</label>
                <select
                  className="input w-full"
                  value={toBedId}
                  onChange={(e) => setToBedId(e.target.value)}
                  required
                >
                  <option value="">Select an available bed…</option>
                  {beds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.ward} · {bed.roomNo ? `Room ${bed.roomNo} · ` : ""}
                      {bed.bedNumber} · {formatINR(bed.dailyRatePaise)}/day
                    </option>
                  ))}
                </select>
                {beds.length === 0 ? (
                  <p className="field-help text-danger">No other bed is available right now.</p>
                ) : null}
              </div>
              <div>
                <label className="field-label">Reason</label>
                <input
                  className="input w-full"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. step-down from ICU to general ward"
                />
              </div>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setTransferOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                  {loading ? "Transferring…" : "Transfer patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-navy">Daily progress note</h3>
                <p className="text-xs text-muted-foreground">
                  Clinical progress and treatment details for today
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-page"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitNote} className="mt-4 space-y-3">
              <div>
                <label className="field-label">Progress / observation *</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Patient condition, complaints, examination findings"
                  required
                />
              </div>
              <div>
                <label className="field-label">Treatment details</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  placeholder="Medication changes, procedures, plan"
                />
              </div>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setNoteOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                  {loading ? "Saving…" : "Save note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
