"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  QrCode,
  Send,
  Smartphone,
} from "lucide-react";
import { formatINR, rupeesToPaise } from "@/modules/shared/money";
import { waLink } from "@/modules/shared/whatsapp";
import PaymentHistoryTable, {
  type HistoryPayment,
} from "./PaymentHistoryTable";

type Method = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";

const METHODS: { value: Method; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "UPI", label: "UPI", icon: QrCode },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "BANK_TRANSFER", label: "Bank Transfer", icon: Landmark },
];

const CATEGORY_LABELS: Record<string, string> = {
  SERVICE_CHARGES: "Service Charges",
  LABORATORY: "Laboratory",
  PHARMACY: "Pharmacy",
  ROOM_CHARGES: "Room Charges",
  DOCTOR_CONSULTATION: "Doctor Consultation",
  OTHER_CHARGES: "Other Charges",
};

type PaymentScreenInvoice = {
  id: string;
  invoiceNo: string;
  department: string;
  billType: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  createdAt: Date | string;
  patient: {
    name: string;
    uhid: string;
    phone: string;
    age: number;
    gender: string;
  };
  itemsByCategory: {
    category: string;
    items: { id: string; description: string; amount: number }[];
  }[];
  payments: HistoryPayment[];
};

export default function PaymentScreen({
  invoice,
  settings,
  collectorName,
}: {
  invoice: PaymentScreenInvoice;
  settings: { hospitalName: string; upiId: string; upiQrImageUrl: string };
  collectorName: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);

  const [method, setMethod] = useState<Method>("CASH");
  const [amountStr, setAmountStr] = useState(
    (invoice.outstanding / 100).toString(),
  );
  const [receivedStr, setReceivedStr] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [smsPending, setSmsPending] = useState(false);
  const [smsNotice, setSmsNotice] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  const amountPaise = rupeesToPaise(amountStr);
  const receivedPaise = receivedStr.trim() ? rupeesToPaise(receivedStr) : null;
  const amountValid =
    amountPaise !== null && amountPaise > 0 && amountPaise <= invoice.outstanding;
  const change =
    method === "CASH" && receivedPaise !== null && amountPaise !== null
      ? Math.max(receivedPaise - amountPaise, 0)
      : null;

  const whatsappMessage = useMemo(
    () =>
      `AHLAIN HOSPITAL: Invoice ${invoice.invoiceNo} for ${invoice.patient.name} — amount due ${formatINR(invoice.outstanding)}. Pay via UPI to ${settings.upiId}.`,
    [invoice, settings.upiId],
  );

  async function sendPaymentLinkSms() {
    if (smsPending) return;
    setSmsPending(true);
    setSmsNotice(null);
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "payment_link", invoiceId: invoice.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; to?: string }
        | null;
      if (!response.ok) {
        setSmsNotice({
          tone: "error",
          text: payload?.error ?? "SMS could not be sent. Please try again.",
        });
        return;
      }
      setSmsNotice({
        tone: "success",
        text: `Payment reminder sent by SMS to ${payload?.to ?? invoice.patient.phone}.`,
      });
    } catch {
      setSmsNotice({
        tone: "error",
        text: "Network error while sending the SMS.",
      });
    } finally {
      setSmsPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (amountPaise === null || amountPaise <= 0) {
      setError({ message: "Enter a valid amount greater than zero.", field: "amount" });
      return;
    }
    if (amountPaise > invoice.outstanding) {
      setError({
        message: `Amount cannot exceed the outstanding balance of ${formatINR(invoice.outstanding)}.`,
        field: "amount",
      });
      return;
    }
    const ref = transactionRef.trim();
    if (method === "UPI" && !/^\d{12}$/.test(ref)) {
      setError({
        message: "UPI transaction reference must be exactly 12 digits.",
        field: "transactionRef",
      });
      return;
    }
    if ((method === "CARD" || method === "BANK_TRANSFER") && ref.length < 3) {
      setError({
        message: "Transaction reference is required for card and bank payments.",
        field: "transactionRef",
      });
      return;
    }
    if (
      method === "CASH" &&
      receivedStr.trim() &&
      (receivedPaise === null || receivedPaise < amountPaise)
    ) {
      setError({
        message: "Amount received cannot be less than the payment amount.",
        field: "amountReceived",
      });
      return;
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    setPending(true);
    try {
      const response = await fetch(
        `/api/billing/invoices/${invoice.id}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: invoice.id,
            amount: amountPaise,
            method,
            transactionRef: ref,
            amountReceived:
              method === "CASH" && receivedPaise !== null
                ? receivedPaise
                : undefined,
            idempotencyKey: idempotencyKey.current,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError({
          message: data.error ?? "Could not record the payment. Please try again.",
          field: data.details?.field,
        });
        setPending(false);
        return;
      }
      router.push(`/billing/receipts/${data.payment.id}?new=1`);
      router.refresh();
    } catch {
      setError({
        message: "Network error — the payment was not recorded. Please try again.",
      });
      setPending(false);
    }
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {/* LEFT — Invoice Details */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Invoice details</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-line px-5 py-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Patient</p>
              <p className="mt-0.5 font-medium text-navy">
                {invoice.patient.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Patient ID</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.patient.uhid}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoice no</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.invoiceNo}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bill type</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.billType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.department}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="mt-0.5 font-medium text-navy">
                {new Date(invoice.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Line items by category
            </p>
            <div className="space-y-4">
              {invoice.itemsByCategory.map((group) => (
                <div key={group.category}>
                  <p className="mb-1 text-sm font-semibold text-navy">
                    {CATEGORY_LABELS[group.category] ?? group.category}
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {group.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="py-1.5 text-muted-foreground">
                            {item.description}
                          </td>
                          <td className="py-1.5 text-right text-navy">
                            {formatINR(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          <dl className="space-y-2.5 border-t border-line px-5 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium text-navy">
                {formatINR(invoice.totalAmount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd className="font-medium text-success">
                {formatINR(invoice.paidAmount)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5">
              <dt className="font-semibold text-navy">Outstanding</dt>
              <dd className="text-base font-semibold text-danger">
                {formatINR(invoice.outstanding)}
              </dd>
            </div>
          </dl>
        </section>

        {/* RIGHT — Payment */}
        <section className="card h-fit">
          <div className="card-header">
            <h2 className="card-title">Collect payment</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-5 py-4" noValidate>
            <div className="rounded-lg bg-page px-4 py-3">
              <p className="text-xs text-muted-foreground">Amount due</p>
              <p className="text-2xl font-semibold text-navy">
                {formatINR(invoice.outstanding)}
              </p>
            </div>

            <div>
              <label htmlFor="amount" className="field-label">
                Amount to collect (₹)
              </label>
              <input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                aria-invalid={error?.field === "amount" || undefined}
                className={`input w-full ${error?.field === "amount" ? "input-invalid" : ""}`}
              />
              <p className="field-help">
                Enter a lower amount to record a partial payment. Maximum{" "}
                {formatINR(invoice.outstanding)}.
              </p>
            </div>

            {/* Payment method buttons */}
            <fieldset>
              <legend className="field-label">Payment method</legend>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((option) => {
                  const Icon = option.icon;
                  const selected = method === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setMethod(option.value);
                        setError(null);
                      }}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                        selected
                          ? "border-medical bg-medical text-white"
                          : "border-line bg-white text-navy hover:bg-page"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* CASH */}
            {method === "CASH" ? (
              <div className="space-y-3 rounded-lg border border-line bg-page p-4">
                <div>
                  <label htmlFor="received" className="field-label">
                    Amount received (₹)
                  </label>
                  <input
                    id="received"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 6000"
                    value={receivedStr}
                    onChange={(e) => setReceivedStr(e.target.value)}
                    className={`input w-full ${error?.field === "amountReceived" ? "input-invalid" : ""}`}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Change returned</span>
                  <span className="font-semibold text-navy">
                    {change !== null ? formatINR(change) : "—"}
                  </span>
                </div>
              </div>
            ) : null}

            {/* UPI — ONE static hospital QR, never generated per invoice */}
            {method === "UPI" ? (
              <div className="space-y-3 rounded-lg border border-line bg-page p-4">
                <div className="flex gap-4">
                  <Image
                    src={settings.upiQrImageUrl}
                    alt="Hospital UPI QR code"
                    width={132}
                    height={132}
                    className="h-[132px] w-[132px] shrink-0 rounded-md border border-line bg-white"
                  />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-navy">
                      Scan this QR using Google Pay, PhonePe, Paytm or any UPI
                      app
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">UPI ID:</span>
                      <span className="font-mono font-semibold text-navy">
                        {settings.upiId}
                      </span>
                      <button
                        type="button"
                        onClick={copyUpiId}
                        aria-label="Copy UPI ID"
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-medical"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      {copied ? (
                        <span className="text-xs text-success">Copied</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Payment will be verified and reconciled with the hospital
                      payment account.
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="utr" className="field-label">
                    Transaction / UTR reference
                  </label>
                  <input
                    id="utr"
                    type="text"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="Enter UPI transaction reference"
                    value={transactionRef}
                    onChange={(e) =>
                      setTransactionRef(e.target.value.replace(/\D/g, ""))
                    }
                    aria-invalid={error?.field === "transactionRef" || undefined}
                    className={`input w-full ${error?.field === "transactionRef" ? "input-invalid" : ""}`}
                  />
                  <p className="field-help">
                    12 digits from your UPI app. Must be unique across all
                    payments.
                  </p>
                </div>
              </div>
            ) : null}

            {/* CARD */}
            {method === "CARD" ? (
              <div className="rounded-lg border border-line bg-page p-4">
                <label htmlFor="cardRef" className="field-label">
                  Card transaction reference
                </label>
                <input
                  id="cardRef"
                  type="text"
                  placeholder="POS reference / last 4 digits"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  aria-invalid={error?.field === "transactionRef" || undefined}
                  className={`input w-full ${error?.field === "transactionRef" ? "input-invalid" : ""}`}
                />
              </div>
            ) : null}

            {/* BANK TRANSFER */}
            {method === "BANK_TRANSFER" ? (
              <div className="rounded-lg border border-line bg-page p-4">
                <label htmlFor="bankRef" className="field-label">
                  Bank transaction reference
                </label>
                <input
                  id="bankRef"
                  type="text"
                  placeholder="UTR / NEFT / IMPS reference"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  aria-invalid={error?.field === "transactionRef" || undefined}
                  className={`input w-full ${error?.field === "transactionRef" ? "input-invalid" : ""}`}
                />
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                {error.message}
              </p>
            ) : null}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={pending || !amountValid}
                className="btn btn-primary btn-block"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {pending
                  ? "Recording…"
                  : method === "UPI"
                    ? "Verify & Record Payment"
                    : "Record payment"}
              </button>
              <a
                href={waLink(invoice.patient.phone, whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-block"
              >
                <Send className="h-4 w-4" aria-hidden />
                Send Payment Link via WhatsApp
              </a>
              <button
                type="button"
                onClick={sendPaymentLinkSms}
                disabled={smsPending}
                className="btn btn-secondary btn-block"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                {smsPending ? "Sending…" : "Send Payment Link via SMS"}
              </button>
              {smsNotice ? (
                <p
                  role="status"
                  className={`text-center text-xs ${
                    smsNotice.tone === "success"
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {smsNotice.text}
                </p>
              ) : null}
              <p className="text-center text-[11px] text-muted-foreground">
                Collecting as {collectorName}. Amounts are re-verified on the
                server before recording.
              </p>
            </div>
          </form>
        </section>
      </div>

      {/* BOTTOM — Payment History */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Payment history</h2>
        </div>
        <div className="overflow-x-auto">
          <PaymentHistoryTable payments={invoice.payments} />
        </div>
      </section>
    </div>
  );
}
