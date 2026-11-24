"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function AppointmentActions({
  appointmentId,
  currentStatus,
}: {
  appointmentId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function handleStatus(newStatus: "CHECKED_IN" | "DONE" | "NO_SHOW") {
    setLoadingAction(newStatus);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoadingAction(null);
    }
  }

  if (currentStatus === "DONE") {
    return (
      <span className="text-xs text-muted-foreground italic">
        Consultation Completed
      </span>
    );
  }

  if (currentStatus === "NO_SHOW") {
    return (
      <span className="text-xs text-danger/70 italic">
        Cancelled / No-Show
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {currentStatus === "SCHEDULED" ? (
        <button
          type="button"
          disabled={loadingAction !== null}
          onClick={() => handleStatus("CHECKED_IN")}
          className="btn btn-secondary btn-sm flex items-center gap-1 text-xs hover:border-teal hover:text-teal font-medium"
          title="Mark patient checked in at reception counter"
        >
          {loadingAction === "CHECKED_IN" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 text-teal" />
          )}
          Check-in
        </button>
      ) : null}

      {currentStatus === "CHECKED_IN" ? (
        <button
          type="button"
          disabled={loadingAction !== null}
          onClick={() => handleStatus("DONE")}
          className="btn btn-primary btn-sm flex items-center gap-1 text-xs shadow-xs"
          title="Mark consultation completed"
        >
          {loadingAction === "DONE" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5" />
          )}
          Complete
        </button>
      ) : null}

      <button
        type="button"
        disabled={loadingAction !== null}
        onClick={() => handleStatus("NO_SHOW")}
        className="btn btn-secondary btn-sm flex items-center gap-1 text-xs text-slate-500 hover:text-danger hover:bg-danger-bg hover:border-red-200"
        title="Mark as cancelled or patient did not arrive"
      >
        {loadingAction === "NO_SHOW" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <XCircle className="h-3.5 w-3.5" />
        )}
        Cancel
      </button>
    </div>
  );
}
