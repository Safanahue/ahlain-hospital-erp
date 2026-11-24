"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Target = "RECONCILED" | "MISMATCH";

export default function ReconcileActions({
  paymentId,
  receiptNo,
  amount,
}: {
  paymentId: string;
  receiptNo: string;
  amount: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function open(next: Target) {
    setTarget(next);
    setNote("");
    setError(null);
  }

  async function confirm() {
    if (!target || pending) return;
    setError(null);
    if (target === "MISMATCH" && !note.trim()) {
      setError("A note is required when marking a payment as a mismatch.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        `/api/billing/payments/${paymentId}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: target, note: note.trim() }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not update the payment. Please try again.");
        setPending(false);
        return;
      }
      setPending(false);
      setTarget(null);
      router.push(
        `/billing/reconciliation?done=${encodeURIComponent(receiptNo)}&result=${target}`,
      );
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => open("RECONCILED")}
          className="btn btn-success btn-sm"
        >
          Mark reconciled
        </button>
        <button
          type="button"
          onClick={() => open("MISMATCH")}
          className="btn btn-danger btn-sm"
        >
          Mismatch
        </button>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {target === "MISMATCH" ? "Mark as mismatch" : "Mark as reconciled"}
            </DialogTitle>
            <DialogDescription>
              Receipt {receiptNo} · {amount}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label
              htmlFor="recon-note"
              className="block text-sm font-medium text-navy"
            >
              Note{" "}
              {target === "MISMATCH" ? (
                <span className="text-danger">(required)</span>
              ) : (
                <span className="text-muted-foreground">(optional)</span>
              )}
            </label>
            <textarea
              id="recon-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                target === "MISMATCH"
                  ? "Describe the difference with the hospital bank statement"
                  : "e.g. Verified against HDFC statement on 05 Oct"
              }
              className="textarea"
            />
            {error ? (
              <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
