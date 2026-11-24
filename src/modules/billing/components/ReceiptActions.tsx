"use client";

import { useEffect, useState } from "react";
import { Download, MessageCircle, Printer, Smartphone } from "lucide-react";
import { waLink } from "@/modules/shared/whatsapp";

type SmsNotice = { tone: "success" | "error"; text: string };

export default function ReceiptActions({
  paymentId,
  whatsappMessage,
  patientPhone,
  canSendSms,
}: {
  paymentId: string;
  whatsappMessage: string;
  patientPhone: string;
  canSendSms: boolean;
}) {
  const [smsPending, setSmsPending] = useState(false);
  const [notice, setNotice] = useState<SmsNotice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function sendSms() {
    if (smsPending) return;
    setSmsPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "receipt", paymentId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; to?: string }
        | null;

      if (!response.ok) {
        setNotice({
          tone: "error",
          text: payload?.error ?? "SMS could not be sent. Please try again.",
        });
        return;
      }
      setNotice({
        tone: "success",
        text: `Receipt sent by SMS to ${payload?.to ?? patientPhone}.`,
      });
    } catch {
      setNotice({ tone: "error", text: "Network error while sending the SMS." });
    } finally {
      setSmsPending(false);
    }
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary"
        >
          <Printer className="h-4 w-4" aria-hidden />
          Print
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          title="Opens the print dialog — choose 'Save as PDF'"
          className="btn btn-secondary"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </button>
        <a
          href={waLink(patientPhone, whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          WhatsApp
        </a>
        {canSendSms ? (
          <button
            type="button"
            onClick={sendSms}
            disabled={smsPending}
            className="btn btn-secondary"
            title={
              patientPhone
                ? `Send this receipt summary to ${patientPhone}`
                : "No phone number on file"
            }
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            {smsPending ? "Sending…" : "SMS"}
          </button>
        ) : null}
      </div>
      {notice ? (
        <p
          role="status"
          className={`text-xs ${
            notice.tone === "success"
              ? "text-success"
              : "rounded-md bg-danger-bg px-2 py-1 text-danger"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
