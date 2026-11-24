"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { formatINR, rupeesToPaise } from "@/modules/shared/money";

export type RefundablePayment = {
  id: string;
  receiptNo: string;
  createdAt: string;
  amount: number;
  refundable: number;
};

export default function RefundRequestForm({
  payments,
}: {
  payments: RefundablePayment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const [amount, setAmount] = useState(
    payments[0] ? (payments[0].refundable / 100).toString() : "",
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const selected = payments.find((payment) => payment.id === paymentId);
  const amountPaise = rupeesToPaise(amount);

  function choosePayment(id: string) {
    setPaymentId(id);
    const payment = payments.find((row) => row.id === id);
    if (payment) setAmount((payment.refundable / 100).toString());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    if (amountPaise === null || amountPaise <= 0) {
      setMessage({ kind: "error", text: "Enter a refund amount greater than zero." });
      return;
    }
    if (selected && amountPaise > selected.refundable) {
      setMessage({
        kind: "error",
        text: `Maximum refundable on this receipt is ${formatINR(selected.refundable)}.`,
      });
      return;
    }
    if (reason.trim().length < 3) {
      setMessage({ kind: "error", text: "Give a short reason for the refund." });
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, amount: amountPaise, reason: reason.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload?.error ?? "The refund request could not be saved.",
        });
        return;
      }
      setMessage({
        kind: "ok",
        text: "Refund requested. A finance user must approve it before any money is returned.",
      });
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Network error while requesting the refund." });
    } finally {
      setPending(false);
    }
  }

  if (payments.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-muted-foreground">
        No refundable payment on this invoice.
      </p>
    );
  }

  return (
    <div className="px-5 py-4">
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            message.kind === "error"
              ? "bg-danger-bg text-danger"
              : "bg-success-bg text-success"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-page p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="refundPayment" className="field-label">
                Against receipt
              </label>
              <select
                id="refundPayment"
                value={paymentId}
                onChange={(event) => choosePayment(event.target.value)}
                className="input w-full"
              >
                {payments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {payment.receiptNo} · {formatINR(payment.amount)} · refundable{" "}
                    {formatINR(payment.refundable)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="refundAmount" className="field-label">
                Refund amount (₹)
              </label>
              <input
                id="refundAmount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="input w-full"
              />
              {selected ? (
                <p className="field-help">
                  Maximum {formatINR(selected.refundable)} on {selected.receiptNo}
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor="refundReason" className="field-label">
              Reason
            </label>
            <textarea
              id="refundReason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Test cancelled after payment was collected"
              className="textarea"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Submit request
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-secondary btn-sm"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Request refund
        </button>
      )}
    </div>
  );
}
