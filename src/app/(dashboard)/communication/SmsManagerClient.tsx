"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  Save,
  Info,
  Phone,
  FileText,
  X,
  Smartphone,
  Check,
  Loader2,
} from "lucide-react";
import { formatDateTime } from "@/modules/shared/datetime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface SmsLogItem {
  id: string;
  to: string;
  body: string;
  kind: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  provider: string;
  providerMessageId?: string | null;
  error?: string | null;
  entityId?: string | null;
  createdAt: string;
  sentBy?: { id: string; name: string; role: string } | null;
}

export interface SmsTemplateItem {
  code: string;
  name: string;
  body: string;
  dltTemplateId?: string;
  description: string;
  variables: string[];
}

export interface TestSmsResponse {
  success: boolean;
  provider: string;
  requestId?: string;
  messageContent: string;
  recipient: string;
  apiAcceptance: string;
  apiMessage: string;
  deliveryStatus: string;
  deliveryNote: string;
  sentAt: string;
  error?: string;
}

const EXACT_TEST_MESSAGE =
  "AHLAIN Hospital ERP: This is a test SMS. Your SMS gateway integration is being tested successfully.";

export default function SmsManagerClient({
  initialLogs,
  initialTemplates,
  gatewayType,
}: {
  initialLogs: { total: number; items: SmsLogItem[] };
  initialTemplates: Record<string, SmsTemplateItem>;
  gatewayType: string;
}) {
  const [activeTab, setActiveTab] = useState<"logs" | "templates">("logs");
  const [logs, setLogs] = useState<SmsLogItem[]>(initialLogs.items);
  const [totalLogs, setTotalLogs] = useState(initialLogs.total);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Template edit state
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState("");
  const [templateDltId, setTemplateDltId] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Live Test SMS Modal State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<TestSmsResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Filter logs locally and via API
  async function fetchFilteredLogs(status = statusFilter, query = searchQuery) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        q: query,
        take: "50",
      });
      const res = await fetch(`/api/sms/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items);
        setTotalLogs(data.total);
      }
    } catch {
      setFeedback({ type: "error", text: "Failed to reload SMS logs" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(smsId: string) {
    setRetryingId(smsId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/sms/retry/${smsId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "success", text: "SMS re-dispatch processed successfully" });
        await fetchFilteredLogs();
      } else {
        setFeedback({ type: "error", text: data.error || "Retry failed" });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error during retry" });
    } finally {
      setRetryingId(null);
    }
  }

  function startEditTemplate(code: string) {
    const tmpl = templates[code];
    if (!tmpl) return;
    setEditingTemplate(code);
    setTemplateText(tmpl.body);
    setTemplateDltId(tmpl.dltTemplateId || "");
  }

  async function saveTemplateChanges() {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/sms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editingTemplate,
          templateText,
          dltTemplateId: templateDltId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTemplates(data.templates);
        setEditingTemplate(null);
        setFeedback({ type: "success", text: "SMS template updated successfully" });
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to save template" });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error while saving template" });
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleSendTestSms() {
    const cleanDigits = testPhone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      setTestError("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)");
      return;
    }
    if (!testConfirmed) {
      setTestError("Please check the confirmation box before sending");
      return;
    }

    setTestSending(true);
    setTestError(null);
    setTestResult(null);

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

      if (!res.ok) {
        setTestError(data.error || "Fast2SMS test dispatch failed");
      } else {
        setTestResult(data);
        // Refresh background logs table
        fetchFilteredLogs();
      }
    } catch (err: any) {
      setTestError(err.message || "Network error while contacting SMS server");
    } finally {
      setTestSending(false);
    }
  }

  const sentCount = logs.filter((l) => l.status === "SENT").length;
  const failedCount = logs.filter((l) => l.status === "FAILED").length;
  const skippedCount = logs.filter((l) => l.status === "SKIPPED").length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Gateway Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
              <MessageSquare className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-navy">
              SMS Communication Center
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatic patient registration confirmations, payment receipts, Fast2SMS logs, and TRAI DLT settings
          </p>
        </div>

        {/* Action Controls & Gateway Mode Pill */}
        <div className="flex flex-wrap items-center gap-3">
          {gatewayType === "fast2sms" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Fast2SMS Gateway: Connected</span>
            </span>
          ) : gatewayType === "indian_dlt" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Indian DLT Gateway: Active</span>
            </span>
          ) : gatewayType === "twilio" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              <span>Twilio Gateway: Active</span>
            </span>
          ) : (
            <span
              title="No live SMS API keys are set. Messages are logged into the database safely without making network calls."
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800"
            >
              <Info className="h-3.5 w-3.5 text-amber-600" />
              <span>Safe Log-Only Mode (Pre-Flight)</span>
            </span>
          )}

          {/* Admin Test SMS Dedicated Console Link */}
          <Link
            href="/communication/test"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            title="Open dedicated Admin testing console"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-medical" />
            <span>Admin Testing Console</span>
          </Link>

          {/* Admin Test SMS Modal Trigger Button */}
          <button
            type="button"
            onClick={() => {
              setTestModalOpen(true);
              setTestResult(null);
              setTestError(null);
              setTestConfirmed(false);
            }}
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-xs"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send Live Test SMS</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-danger-bg border-danger/20 text-danger"
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-muted-foreground hover:text-navy text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-line gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "logs"
              ? "border-medical text-medical"
              : "border-transparent text-muted-foreground hover:text-navy"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Outbox & Delivery Logs ({totalLogs})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "templates"
              ? "border-medical text-medical"
              : "border-transparent text-muted-foreground hover:text-navy"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Templates & DLT Settings</span>
        </button>
      </div>

      {/* TAB 1: LOGS & OUTBOX */}
      {activeTab === "logs" ? (
        <div className="space-y-4">
          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Total Messages</p>
              <p className="text-xl font-bold text-navy mt-1">{totalLogs}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] font-medium text-emerald-700">Delivered (SENT)</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{sentCount}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] font-medium text-amber-700">Safe Skipped / Log-Only</p>
              <p className="text-xl font-bold text-amber-700 mt-1">{skippedCount}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] font-medium text-danger">Failed Attempts</p>
              <p className="text-xl font-bold text-danger mt-1">{failedCount}</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by +91 mobile, message content, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") fetchFilteredLogs(statusFilter, searchQuery);
                  }}
                  className="input input-sm w-full pl-8 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchFilteredLogs(statusFilter, searchQuery)}
                className="btn btn-secondary btn-sm shrink-0"
              >
                Search
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" />
                <span>Status:</span>
              </span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setStatusFilter(val);
                  fetchFilteredLogs(val, searchQuery);
                }}
                className="input input-sm text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="SENT">Delivered (SENT)</option>
                <option value="SKIPPED">Skipped / Log Only</option>
                <option value="FAILED">Failed</option>
              </select>

              <button
                type="button"
                onClick={() => fetchFilteredLogs()}
                disabled={loading}
                title="Refresh log stream"
                className="btn btn-secondary btn-sm flex items-center gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Recipient (+91)</TableHead>
                    <TableHead>Notification Type</TableHead>
                    <TableHead>Message Text</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Delivery Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                        No SMS delivery logs recorded matching your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((item) => (
                      <TableRow key={item.id} className="hover:bg-page/50">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(new Date(item.createdAt))}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-navy whitespace-nowrap">
                          {item.to}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded bg-page px-2 py-0.5 text-[11px] font-medium text-navy">
                            {item.kind === "PATIENT_REGISTRATION"
                              ? "Registration"
                              : item.kind === "RECEIPT"
                                ? "Payment Receipt"
                                : item.kind === "TEST_SMS"
                                  ? "Admin Test SMS"
                                  : item.kind}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-slate-700 truncate" title={item.body}>
                          {item.body}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground uppercase font-mono">
                          {item.provider}
                        </TableCell>
                        <TableCell>
                          {item.status === "SENT" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Delivered</span>
                            </span>
                          ) : item.status === "FAILED" ? (
                            <span
                              title={item.error || "Delivery failed"}
                              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-danger cursor-help"
                            >
                              <XCircle className="h-3 w-3" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <span
                              title={item.error || "Safe Log Only"}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 cursor-help"
                            >
                              <AlertCircle className="h-3 w-3" />
                              <span>Skipped / Logged</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleRetry(item.id)}
                            disabled={retryingId === item.id}
                            className="btn btn-secondary btn-xs inline-flex items-center gap-1 text-[11px]"
                            title="Re-send this message through active provider"
                          >
                            <Send className="h-3 w-3" />
                            <span>{retryingId === item.id ? "Sending..." : "Resend"}</span>
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      ) : null}

      {/* TAB 2: TEMPLATES & DLT CONFIGURATION */}
      {activeTab === "templates" ? (
        <div className="space-y-6">
          <div className="card p-4 bg-teal/5 border-teal/20 text-xs text-navy space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-teal-800">
              <ShieldCheck className="h-4 w-4" />
              <span>TRAI DLT Compliance & Template Guidelines (India)</span>
            </p>
            <p className="text-muted-foreground">
              To send SMS across Indian telecommunication operators, your message wording must match your registered DLT template verbatim. Use dynamic placeholders like <code className="bg-white px-1 py-0.5 rounded border border-line">&#123;patientName&#125;</code> and <code className="bg-white px-1 py-0.5 rounded border border-line">&#123;amount&#125;</code>.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {Object.values(templates).map((tmpl) => {
              const isEditing = editingTemplate === tmpl.code;

              return (
                <div key={tmpl.code} className="card p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-navy">{tmpl.name}</h3>
                      <p className="text-xs text-muted-foreground">{tmpl.code}</p>
                    </div>
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEditTemplate(tmpl.code)}
                        className="btn btn-secondary btn-xs"
                      >
                        Edit Template
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-medical">Editing</span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">{tmpl.description}</p>

                  {/* Template Text Display / Editor */}
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="field-label">SMS Message Body</label>
                        <textarea
                          rows={4}
                          value={templateText}
                          onChange={(e) => setTemplateText(e.target.value)}
                          className="input w-full font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="field-label">DLT Template ID (19 Digits)</label>
                        <input
                          type="text"
                          value={templateDltId}
                          onChange={(e) => setTemplateDltId(e.target.value)}
                          placeholder="e.g. 1107161234567890123"
                          className="input w-full font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingTemplate(null)}
                          className="btn btn-secondary btn-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveTemplateChanges}
                          disabled={savingTemplate}
                          className="btn btn-primary btn-xs flex items-center gap-1"
                        >
                          <Save className="h-3 w-3" />
                          <span>{savingTemplate ? "Saving..." : "Save Template"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg bg-page p-3 border border-line text-xs font-mono text-slate-800 leading-relaxed">
                        {tmpl.body}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>DLT Template ID:</span>
                        <span className="font-mono font-medium text-navy">
                          {tmpl.dltTemplateId || "Not Registered"}
                        </span>
                      </div>
                      <div className="pt-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Supported Placeholders:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {tmpl.variables.map((v) => (
                            <span
                              key={v}
                              className="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal-800"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* SEND LIVE TEST SMS MODAL (Admin Only)                                     */}
      {/* ========================================================================= */}
      {testModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs animate-in fade-in duration-150"
        >
          <div className="card w-full max-w-lg overflow-hidden shadow-2xl border border-slate-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-navy">Send Live Test SMS</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Fast2SMS Gateway Quick Route (route=q)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-navy transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Safety notice */}
              <div className="rounded-lg bg-teal/5 border border-teal/20 p-3 text-xs text-navy space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-teal-800">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                  <span>Admin Verification Test</span>
                </p>
                <p className="text-muted-foreground text-[11px]">
                  This test will send exactly <strong>one live SMS</strong> directly to your personal mobile phone using your verified Fast2SMS account. No patient, doctor, or billing records will be touched or alerted.
                </p>
              </div>

              {/* Mobile Phone Input */}
              <div>
                <label htmlFor="test-phone-input" className="field-label flex items-center justify-between">
                  <span>Recipient Indian Mobile Number</span>
                  <span className="text-[11px] text-muted-foreground font-normal">10 Digits</span>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2 text-xs font-semibold text-slate-500 pointer-events-none">
                    +91
                  </span>
                  <input
                    id="test-phone-input"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    value={testPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setTestPhone(digits);
                      setTestError(null);
                    }}
                    disabled={testSending || !!testResult}
                    className="input w-full pl-12 font-mono text-sm tracking-wide text-navy"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Enter your personal phone number to inspect actual handset arrival.
                </p>
              </div>

              {/* Exact Message Preview Box */}
              <div>
                <label className="field-label">Exact Message to be Sent</label>
                <div className="rounded-lg bg-slate-50 border border-line p-3 text-xs font-mono text-slate-800 leading-relaxed">
                  &quot;{EXACT_TEST_MESSAGE}&quot;
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1 px-1">
                  <span>Characters: {EXACT_TEST_MESSAGE.length} (1 SMS Credit)</span>
                  <span className="font-semibold text-teal-700">Route: Quick SMS (route=q)</span>
                </div>
              </div>

              {/* Error Alert */}
              {testError && (
                <div className="rounded-lg bg-danger-bg border border-danger/20 p-3 text-xs text-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Dispatch Error</p>
                    <p className="text-[11px] mt-0.5">{testError}</p>
                  </div>
                </div>
              )}

              {/* Success Result Box */}
              {testResult && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Fast2SMS Gateway Accepted Message</p>
                      <p className="text-[11px] text-emerald-700">
                        {testResult.apiMessage}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-white p-3 border border-emerald-100 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Fast2SMS Request ID:</span>
                      <span className="font-mono font-bold text-navy">
                        {testResult.requestId || "Accepted"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Recipient:</span>
                      <span className="font-mono font-semibold text-navy">
                        {testResult.recipient}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">API Acceptance Status:</span>
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {testResult.apiAcceptance} (200 OK)
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-muted-foreground">Operator Delivery Status:</span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {testResult.deliveryStatus}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-emerald-800 leading-tight">
                    {testResult.deliveryNote}
                  </p>
                </div>
              )}

              {/* Confirmation Checkbox (Required before send) */}
              {!testResult && (
                <div className="rounded-lg border border-line bg-page p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-navy select-none">
                    <input
                      type="checkbox"
                      checked={testConfirmed}
                      onChange={(e) => {
                        setTestConfirmed(e.target.checked);
                        setTestError(null);
                      }}
                      disabled={testSending}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical"
                    />
                    <span>
                      I confirm that I want to send <strong>exactly one live test SMS</strong> to <strong>+91 {testPhone || "XXXXXXXXXX"}</strong> via Fast2SMS.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-line px-5 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="btn btn-secondary btn-sm"
              >
                {testResult ? "Close" : "Cancel"}
              </button>

              {!testResult ? (
                <button
                  type="button"
                  onClick={handleSendTestSms}
                  disabled={testSending || testPhone.length !== 10 || !testConfirmed}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {testSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Sending to Fast2SMS...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Confirm & Send Live Test SMS</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTestModalOpen(false);
                    fetchFilteredLogs();
                  }}
                  className="btn btn-primary btn-sm flex items-center gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>View in Delivery Outbox</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
