"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function OpActions({
  visitId,
  currentStatus,
  patientId,
}: {
  visitId: string;
  currentStatus: string;
  patientId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatus(newStatus: "WAITING_ROOM" | "COMPLETED" | "CANCELLED") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/op/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update status");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "COMPLETED") {
    return (
      <div className="flex items-center justify-between w-full">
        <span className="text-xs text-success font-medium flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4" />
          Clinical consultation completed.
        </span>
        <Link
          href={`/billing/invoices/new?patientId=${patientId}&department=OP`}
          className="btn btn-primary btn-sm"
        >
          Proceed to Billing
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (currentStatus === "CANCELLED") {
    return (
      <span className="text-xs text-danger font-medium flex items-center gap-1.5">
        <XCircle className="h-4 w-4" />
        Visit cancelled.
      </span>
    );
  }

  return (
    <div className="space-y-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {currentStatus === "CHECK_IN" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleStatus("WAITING_ROOM")}
            className="btn btn-secondary btn-sm"
          >
            <Clock className="h-3.5 w-3.5" />
            Move to waiting room
          </button>
        ) : null}

        {currentStatus === "WAITING_ROOM" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleStatus("COMPLETED")}
            className="btn btn-primary btn-sm"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Mark Consultation Completed
          </button>
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={() => handleStatus("CANCELLED")}
          className="btn btn-danger btn-sm"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel visit
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
