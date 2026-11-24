"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DentalActions({
  encounterId,
  currentStatus,
  patientId,
}: {
  encounterId: string;
  currentStatus: string;
  patientId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStatus(newStatus: "COMPLETED" | "CANCELLED") {
    setLoading(true);
    try {
      const res = await fetch(`/api/dental/encounters/${encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "COMPLETED") {
    return (
      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/billing/invoices/new?patientId=${patientId}&department=DENTAL`}
          className="btn btn-primary btn-sm"
        >
          Bill Procedure
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (currentStatus === "CANCELLED") {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={() => handleStatus("COMPLETED")}
        className="btn btn-primary btn-sm"
        title="Mark dental procedure complete"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        Complete
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={() => handleStatus("CANCELLED")}
        className="btn btn-secondary btn-sm text-danger hover:bg-danger-bg"
        title="Cancel procedure"
      >
        <XCircle className="h-3.5 w-3.5" />
        Cancel
      </button>
    </div>
  );
}
