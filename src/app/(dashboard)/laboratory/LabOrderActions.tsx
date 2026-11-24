"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, TestTube2, ArrowRight, XCircle, FileText } from "lucide-react";
import Link from "next/link";
import LabResultEntry, { type ResultTemplate } from "./LabResultEntry";

export default function LabOrderActions({
  orderId,
  currentStatus,
  patientId,
  patientAge,
  patientGender,
  testName,
  templates,
}: {
  orderId: string;
  currentStatus: string;
  patientId: string;
  patientAge: number;
  patientGender: string;
  testName: string;
  templates: ResultTemplate[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(
    status: "SAMPLE_COLLECTED" | "VERIFIED" | "CANCELLED",
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/laboratory/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update lab status");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  const reportLink = (
    <Link href={`/laboratory/${orderId}/report`} className="btn btn-secondary btn-sm">
      <FileText className="h-3.5 w-3.5" aria-hidden />
      Report
    </Link>
  );

  if (currentStatus === "CANCELLED") return null;

  if (currentStatus === "VERIFIED") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        {reportLink}
        <Link
          href={`/billing/invoices/new?patientId=${patientId}&department=LAB`}
          className="btn btn-primary btn-sm"
        >
          Bill Lab
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (currentStatus === "RESULT_ENTERED") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1.5">
          {reportLink}
          <button
            type="button"
            disabled={loading}
            onClick={() => updateStatus("VERIFIED")}
            className="btn btn-primary btn-sm bg-success hover:bg-success/90"
            title="Verify and finalize report"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Verify Report
          </button>
        </div>
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        {currentStatus === "ORDERED" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => updateStatus("SAMPLE_COLLECTED")}
            className="btn btn-secondary btn-sm"
            title="Mark specimen as collected from patient"
          >
            <TestTube2 className="h-3.5 w-3.5" />
            Collect Sample
          </button>
        ) : null}

        {currentStatus === "SAMPLE_COLLECTED" ? (
          <LabResultEntry
            orderId={orderId}
            testName={testName}
            patient={{ age: patientAge, gender: patientGender }}
            templates={templates}
          />
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={() => updateStatus("CANCELLED")}
          className="btn btn-secondary btn-sm text-danger hover:bg-danger-bg"
          title="Cancel lab requisition"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
