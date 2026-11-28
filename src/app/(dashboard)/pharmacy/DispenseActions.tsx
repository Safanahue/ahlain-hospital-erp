"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Receipt, AlertCircle, Undo2 } from "lucide-react";

interface Prescription {
  id: string;
  dispenseNo: string;
  status: string;
  totalPaise: number;
  patientId: string;
  patient: { name: string; uhid: string };
}

interface InvoiceLink {
  id: string;
  invoiceNo: string;
}

export default function DispenseActions({
  prescription,
  invoice,
}: {
  prescription: Prescription;
  invoice?: InvoiceLink | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"dispense" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState("");

  const isPending = prescription.status === "PENDING";
  const isDispensed = prescription.status === "DISPENSED";

  const call = async (path: string, body?: unknown, mode: "dispense" | "cancel" = "dispense") => {
    setLoading(mode);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "The request could not be completed");
      }
      setAskingReason(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  const handleDispense = () => {
    const ok = window.confirm(
      `Dispense ${prescription.dispenseNo}? Stock is deducted and a pharmacy invoice is created for the patient.`,
    );
    if (!ok) return;
    void call(`/api/pharmacy/prescriptions/${prescription.id}/dispense`);
  };

  const handleCancel = () => {
    if (reason.trim().length < 3) {
      setError("Enter a reason for the cancellation (3+ characters)");
      return;
    }
    void call(`/api/pharmacy/prescriptions/${prescription.id}/cancel`, { reason }, "cancel");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {error && (
        <span className="flex max-w-56 items-start gap-1 text-right text-[11px] text-danger">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </span>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {isPending && (
          <button
            type="button"
            onClick={handleDispense}
            disabled={loading !== null}
            className="btn btn-sm flex items-center gap-1.5 bg-teal-600 text-xs text-white shadow-xs hover:bg-teal-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {loading === "dispense" ? "Dispensing..." : "Dispense"}
          </button>
        )}

        {invoice && (
          <Link
            href={`/billing/invoices/${invoice.id}`}
            className="btn btn-sm btn-secondary flex items-center gap-1 text-xs"
            title="Open the pharmacy invoice for this dispensing record"
          >
            <Receipt className="h-3.5 w-3.5" />
            {invoice.invoiceNo}
          </Link>
        )}

        {isDispensed && (
          <button
            type="button"
            onClick={() => setAskingReason((v) => !v)}
            className="btn btn-sm btn-secondary flex items-center gap-1 text-xs text-danger"
            title="Return the medicines to stock and cancel the pharmacy bill"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Return
          </button>
        )}

        {isPending && (
          <button
            type="button"
            onClick={() => setAskingReason((v) => !v)}
            className="btn btn-sm btn-secondary text-xs text-danger"
            title="Cancel this prescription"
          >
            Cancel
          </button>
        )}
      </div>

      {askingReason && (
        <div className="mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <input
            className="input w-full text-xs"
            placeholder="Reason (kept in the audit log)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              className="btn btn-secondary btn-sm text-[11px]"
              onClick={() => {
                setAskingReason(false);
                setError(null);
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-sm bg-danger text-[11px] text-white"
              onClick={handleCancel}
              disabled={loading !== null}
            >
              {loading === "cancel" ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
