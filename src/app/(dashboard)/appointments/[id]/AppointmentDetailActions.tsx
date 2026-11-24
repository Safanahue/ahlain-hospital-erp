"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";

export default function AppointmentDetailActions({
  appointmentId,
  actions,
}: {
  appointmentId: string;
  actions: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!actions || actions.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No further actions available for this appointment.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={loading}
          onClick={() => handleAction(action)}
          className={`btn btn-sm ${
            action === "CHECK_IN"
              ? "btn-primary"
              : action === "DONE"
                ? "btn-primary bg-success hover:bg-success/90"
                : "btn-secondary text-danger hover:bg-danger-bg"
          }`}
        >
          {action === "CHECK_IN" || action === "DONE" ? (
            <CheckCircle className="h-4 w-4" aria-hidden />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden />
          )}
          {action === "CHECK_IN" ? "Check In" : action === "DONE" ? "Complete" : "Mark No-Show"}
        </button>
      ))}
    </div>
  );
}
