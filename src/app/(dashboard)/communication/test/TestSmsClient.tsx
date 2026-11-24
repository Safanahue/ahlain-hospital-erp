"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  ArrowLeft,
  Info,
  Server,
  Lock,
  MessageSquare,
  HelpCircle,
} from "lucide-react";

const REQUIRED_TEST_MESSAGE =
  "AHLAIN Hospital ERP: This is a test SMS. Your SMS gateway integration is being tested successfully.";

interface TestResultData {
  success: boolean;
  httpStatus: number;
  provider: string;
  requestId?: string;
  messageContent?: string;
  recipient?: string;
  apiAcceptance: string;
  apiMessage?: string;
  providerResponse?: any;
  deliveryStatus: string;
  deliveryNote?: string;
  error?: string;
  sentAt?: string;
}

export default function TestSmsClient({
  adminName,
  providerName,
  isFast2Sms,
  isConfigured,
}: {
  adminName: string;
  providerName: string;
  isFast2Sms: boolean;
  isConfigured: boolean;
}) {
  const [adminPhone, setAdminPhone] = useState("8129184094");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResultData | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const cleanDigits = adminPhone.replace(/\D/g, "");
  const isValidPhone = /^[6-9]\d{9}$/.test(cleanDigits);

  async function handleSendTest() {
    if (!isFast2Sms) {
      setErrorBanner("Active SMS provider is not Fast2SMS. Testing is restricted to Fast2SMS.");
      return;
    }
    if (!isValidPhone) {
      setErrorBanner("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).");
      return;
    }
    if (!confirmed) {
      setErrorBanner("Please check the confirmation box before sending.");
      return;
    }

    setSending(true);
    setErrorBanner(null);
    setResult(null);

    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanDigits,
          confirmed: true,
        }),
      });

      const data = await res.json();
      setResult({
        ...data,
        httpStatus: res.status,
      });

      if (!res.ok) {
        setErrorBanner(data.error || `Fast2SMS returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setErrorBanner(err.message || "Network error while connecting to server");
      setResult({
        success: false,
        httpStatus: 0,
        provider: providerName,
        apiAcceptance: "NETWORK_ERROR",
        deliveryStatus: "FAILED",
        error: err.message,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/communication"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SMS Center & Delivery Logs
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          Logged in as Admin ({adminName})
        </span>
      </div>

      {/* Main Console Card */}
      <div className="rounded-xl border border-line bg-white shadow-2xs">
        <div className="border-b border-line px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-navy">
                Admin SMS Testing Console
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Live gateway verification for Fast2SMS. Patient SMS is strictly paused during testing.
              </p>
            </div>
            {isFast2Sms && isConfigured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Fast2SMS Active & Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Provider: {providerName} (Not Fast2SMS)
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Safety Pause Notice */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-950">
                Automatic Patient SMS is Currently Disabled
              </p>
              <p className="mt-0.5 text-blue-800 leading-relaxed">
                Automatic patient registration SMS and payment receipt SMS are temporarily paused in the codebase.
                No patient will receive messages. Only manually confirmed test SMS to your verified Admin phone number is permitted.
              </p>
            </div>
          </div>

          {/* Configuration Verification Card */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-slate-50/60 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">Active Gateway</span>
              <p className="mt-1 font-mono text-sm font-semibold text-navy">
                {isFast2Sms ? "Fast2SMS (Official India)" : providerName}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50/60 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">Gateway Route</span>
              <p className="mt-1 font-mono text-sm font-semibold text-navy">
                Quick SMS (route=q)
              </p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50/60 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">API Credentials</span>
              <p className="mt-1 font-mono text-sm font-semibold text-emerald-700">
                {isConfigured ? "Loaded Securely (Server-Side)" : "Missing Keys"}
              </p>
            </div>
          </div>

          {/* Step 1: Admin Mobile Number */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy">
              Step 1: Admin Verification Phone Number
            </label>
            <div className="relative max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="font-mono text-xs font-semibold text-slate-500">+91</span>
              </div>
              <input
                type="tel"
                value={adminPhone}
                onChange={(e) => {
                  setAdminPhone(e.target.value);
                  setErrorBanner(null);
                  setResult(null);
                }}
                disabled={sending}
                placeholder="Enter 10-digit mobile number"
                className="input pl-12 text-sm font-mono tracking-wide"
                maxLength={10}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Test SMS is strictly locked to this number. Messages to arbitrary numbers or patients are blocked.
            </p>
          </div>

          {/* Step 2: Exact Test Message Preview */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy">
              Step 2: Exact Message Text to be Sent
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-navy leading-relaxed shadow-inner">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                Message Body (Single SMS Segment):
              </span>
              &quot;{REQUIRED_TEST_MESSAGE}&quot;
            </div>
          </div>

          {/* Step 3: Explicit Confirmation */}
          <div className="rounded-xl border border-line bg-slate-50/70 p-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setErrorBanner(null);
                }}
                disabled={sending}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical"
              />
              <div className="text-xs text-navy leading-relaxed">
                <span className="font-semibold block">Explicit Admin Authorization</span>
                I confirm that I want to send <strong>exactly one live test SMS</strong> to my verified number{" "}
                <strong>+91 {isValidPhone ? cleanDigits : "XXXXXXXXXX"}</strong> via Fast2SMS Quick Route.
              </div>
            </label>
          </div>

          {/* Error Banner */}
          {errorBanner && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-950">SMS Dispatch Not Accepted</p>
                <p className="mt-0.5 text-rose-800">{errorBanner}</p>
              </div>
            </div>
          )}

          {/* Send Action Button */}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <div className="text-xs text-muted-foreground">
              {sending ? "Contacting Fast2SMS API..." : "Ready for manual dispatch"}
            </div>
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sending || !isFast2Sms || !isValidPhone || !confirmed}
              className="btn btn-primary flex items-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending to Fast2SMS...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Send Live Test SMS</span>
                </>
              )}
            </button>
          </div>

          {/* Detailed Response / Diagnostic Inspection Panel */}
          {result && (
            <div className="mt-6 rounded-xl border border-line bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                  <Server className="h-4 w-4 text-medical" />
                  <span>API Response & Delivery Diagnostics</span>
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    result.success
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {result.apiAcceptance} (HTTP {result.httpStatus})
                </span>
              </div>

              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-muted-foreground">Active Provider:</span>
                  <span className="font-mono font-semibold text-navy">{result.provider}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-muted-foreground">Recipient Number:</span>
                  <span className="font-mono font-semibold text-navy">{result.recipient || `+91${cleanDigits}`}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-muted-foreground">API Acceptance Status:</span>
                  <span
                    className={`font-semibold ${
                      result.apiAcceptance === "ACCEPTED" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {result.apiAcceptance}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-muted-foreground">Operator Delivery Status:</span>
                  <span className="font-semibold text-blue-700">
                    {result.deliveryStatus}
                  </span>
                </div>
                {result.requestId && (
                  <div className="flex justify-between border-b border-slate-100 py-1 sm:col-span-2">
                    <span className="text-muted-foreground">Fast2SMS Request ID:</span>
                    <span className="font-mono font-bold text-navy">{result.requestId}</span>
                  </div>
                )}
              </div>

              {/* Raw Provider Response Message */}
              <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Provider Response Payload:
                </span>
                {typeof result.providerResponse === "object"
                  ? JSON.stringify(result.providerResponse, null, 2)
                  : result.apiMessage || result.error || "No payload returned"}
              </div>

              {/* Fast2SMS Activation Guidance if Recharge Block is Detected */}
              {result.error?.includes("100 INR") && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4 text-amber-700" />
                    Fast2SMS Account Activation Required (1-Time ₹100 Recharge)
                  </p>
                  <p className="text-amber-800 leading-relaxed">
                    Fast2SMS validated your API key successfully, but blocks the programmatic API route until the account completes one recharge of ₹100 or more on fast2sms.com.
                    Once recharged, you can return here and click <strong>Send Live Test SMS</strong> again to verify live delivery.
                  </p>
                </div>
              )}

              {/* Link to Delivery Logs */}
              <div className="pt-2 flex justify-end">
                <Link
                  href="/communication"
                  className="btn btn-secondary btn-sm flex items-center gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>View All Logs in SMS Center</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
