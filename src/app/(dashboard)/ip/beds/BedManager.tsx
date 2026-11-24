"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatINR } from "@/modules/shared/money";

export type BedRow = {
  id: string;
  bedNumber: string;
  ward: string;
  roomNo: string | null;
  floor: string | null;
  dailyRatePaise: number;
  status: string;
  occupant: {
    name: string;
    uhid: string;
    admissionNo: string;
    admissionId: string;
  } | null;
};

type Draft = {
  id: string | null;
  bedNumber: string;
  ward: string;
  roomNo: string;
  floor: string;
  rate: string;
  status: string;
};

function emptyDraft(): Draft {
  return {
    id: null,
    bedNumber: "",
    ward: "General Ward",
    roomNo: "",
    floor: "",
    rate: "",
    status: "AVAILABLE",
  };
}

function statusClass(status: string) {
  if (status === "AVAILABLE") return "bg-success-bg text-success";
  if (status === "OCCUPIED") return "bg-info-bg text-info";
  return "bg-warning-bg text-warning";
}

export default function BedManager({
  initialBeds,
  canManage,
}: {
  initialBeds: BedRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [beds, setBeds] = useState<BedRow[]>(initialBeds);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const wards = [...new Set(beds.map((bed) => bed.ward))].sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.bedNumber.trim() || !draft.ward.trim()) {
      setError("Bed number and ward are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/ip/beds/${draft.id}` : "/api/ip/beds", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bedNumber: draft.bedNumber.trim(),
          ward: draft.ward.trim(),
          roomNo: draft.roomNo.trim() || null,
          floor: draft.floor.trim() || null,
          dailyRateRupees: Number(draft.rate) || 0,
          ...(draft.id ? { status: draft.status } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save the bed");

      const saved = data.bed as {
        id: string;
        bedNumber: string;
        ward: string;
        roomNo: string | null;
        floor: string | null;
        dailyRatePaise: number;
        status: string;
      };

      setBeds((current) => {
        if (draft.id) {
          return current.map((bed) =>
            bed.id === saved.id
              ? { ...bed, ...saved, occupant: saved.status === "OCCUPIED" ? bed.occupant : null }
              : bed,
          );
        }
        return [
          ...current,
          { ...saved, occupant: null },
        ].sort((a, b) => a.ward.localeCompare(b.ward) || a.bedNumber.localeCompare(b.bedNumber));
      });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the bed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ip/beds/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete the bed");
      }
      setBeds((current) => current.filter((bed) => bed.id !== id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the bed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="card-title">Wards, rooms &amp; beds</h2>
          <p className="card-subtitle">
            Bed tariffs feed the discharge bill. Occupied beds cannot be deleted or marked free.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setError(null);
              setDraft(emptyDraft());
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add bed
          </button>
        ) : null}
      </div>

      {error && !draft ? (
        <p className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {wards.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <BedDouble className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium text-navy">No beds configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add the first ward bed to start admitting patients.
          </p>
        </div>
      ) : (
        wards.map((ward) => {
          const wardBeds = beds.filter((bed) => bed.ward === ward);
          const available = wardBeds.filter((bed) => bed.status === "AVAILABLE").length;
          return (
            <div key={ward} className="card overflow-hidden">
              <div className="card-header flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="card-title">{ward}</h3>
                  <p className="card-subtitle">
                    {wardBeds.length} bed{wardBeds.length === 1 ? "" : "s"} · {available} available
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-page text-left text-xs text-navy">
                      <th className="px-5 py-2 font-semibold">Bed</th>
                      <th className="px-3 py-2 font-semibold">Room</th>
                      <th className="px-3 py-2 font-semibold">Floor</th>
                      <th className="px-3 py-2 font-semibold">Tariff / day</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Occupant</th>
                      {canManage ? (
                        <th className="px-5 py-2 text-right font-semibold">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {wardBeds.map((bed) => (
                      <tr key={bed.id} className="border-t border-line">
                        <td className="px-5 py-2 font-medium text-navy">{bed.bedNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground">{bed.roomNo ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{bed.floor ?? "—"}</td>
                        <td className="px-3 py-2 text-navy">{formatINR(bed.dailyRatePaise)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(bed.status)}`}
                          >
                            {bed.status.charAt(0) + bed.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {bed.occupant ? (
                            <Link
                              href={`/ip/${bed.occupant.admissionId}`}
                              className="text-medical hover:underline"
                            >
                              {bed.occupant.name}
                              <span className="block text-[10px] text-muted-foreground">
                                {bed.occupant.admissionNo}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {canManage ? (
                          <td className="px-5 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-page"
                                onClick={() => {
                                  setError(null);
                                  setDraft({
                                    id: bed.id,
                                    bedNumber: bed.bedNumber,
                                    ward: bed.ward,
                                    roomNo: bed.roomNo ?? "",
                                    floor: bed.floor ?? "",
                                    rate: String(bed.dailyRatePaise / 100),
                                    status: bed.status,
                                  });
                                }}
                                title="Edit bed"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {confirmDelete === bed.id ? (
                                <span className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="btn btn-sm bg-danger text-white"
                                    disabled={saving}
                                    onClick={() => handleDelete(bed.id)}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setConfirmDelete(null)}
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-bg hover:text-danger"
                                  onClick={() => setConfirmDelete(bed.id)}
                                  title="Delete bed"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-navy">
                  {draft.id ? "Edit bed" : "Add bed"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ward, room, tariff and availability
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-page"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="field-label">Bed number *</label>
                  <input
                    className="input w-full"
                    value={draft.bedNumber}
                    onChange={(e) => setDraft({ ...draft, bedNumber: e.target.value })}
                    placeholder="e.g. GW-101"
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Ward *</label>
                  <input
                    className="input w-full"
                    list="ward-options"
                    value={draft.ward}
                    onChange={(e) => setDraft({ ...draft, ward: e.target.value })}
                    placeholder="e.g. General Ward"
                    required
                  />
                  <datalist id="ward-options">
                    {wards.map((ward) => (
                      <option key={ward} value={ward} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="field-label">Room / cabin</label>
                  <input
                    className="input w-full"
                    value={draft.roomNo}
                    onChange={(e) => setDraft({ ...draft, roomNo: e.target.value })}
                    placeholder="e.g. 101"
                  />
                </div>
                <div>
                  <label className="field-label">Floor</label>
                  <input
                    className="input w-full"
                    value={draft.floor}
                    onChange={(e) => setDraft({ ...draft, floor: e.target.value })}
                    placeholder="e.g. 1st floor"
                  />
                </div>
                <div>
                  <label className="field-label">Tariff per day (₹)</label>
                  <input
                    className="input w-full"
                    inputMode="decimal"
                    value={draft.rate}
                    onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                    placeholder="0"
                  />
                </div>
                {draft.id ? (
                  <div>
                    <label className="field-label">Status</label>
                    <select
                      className="input w-full"
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="OCCUPIED">Occupied</option>
                    </select>
                  </div>
                ) : null}
              </div>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Add bed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
