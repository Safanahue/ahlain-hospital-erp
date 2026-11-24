"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Activate / deactivate one catalog row (PATCH /api/services/:id).
 * Follows the same pattern as the Users screen's status toggle.
 */
export default function ServiceToggle({
  service,
}: {
  service: { id: string; name: string; active: boolean };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !service.active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Update failed");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        title={
          service.active
            ? "Hide this service from new billing"
            : "Make this service available again"
        }
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          service.active
            ? "border-danger/40 bg-danger-bg text-danger hover:bg-danger hover:text-white"
            : "border-success/40 bg-success-bg text-success hover:bg-success hover:text-white"
        }`}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : null}
        {service.active ? "Deactivate" : "Activate"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
