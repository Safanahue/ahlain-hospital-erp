"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

export default function RefundDecision({
  refundId,
  refundNo,
  amount,
}: {
  refundId: string;
  refundNo: string;
  amount: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject", rejectionNote = "") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/refunds/${refundId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { note: rejectionNote } : {}),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setError(payload?.error ?? "The refund could not be updated.");
        return;
      }
      setRejecting(false);
      router.refresh();
    } catch {
      setError("Network error while updating the refund.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-1.5">
      {rejecting ? (
        <div className="flex flex-col items-end gap-1.5">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="Reason for rejection"
            className="input h-8 w-52 text-xs"
            aria-label={`Reason for rejecting ${refundNo}`}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => decide("reject", note)}
              className="btn btn-danger btn-sm"
            >
              {pending === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => decide("approve")}
            title={`Approve ${refundNo} for ${amount}`}
            className="btn btn-primary btn-sm"
          >
            {pending === "approve" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
            Approve
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setRejecting(true)}
            className="btn btn-secondary btn-sm"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Reject
          </button>
        </div>
      )}
      {error ? <p className="text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
