"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Receipt, AlertCircle } from "lucide-react";
import Link from "next/link";

interface PrescriptionItem {
  id: string;
  quantity: number;
  dosage: string | null;
  totalPaise: number;
  medicine: {
    id: string;
    name: string;
    stockQuantity: number;
  };
}

interface Prescription {
  id: string;
  dispenseNo: string;
  status: string;
  totalPaise: number;
  patientId: string;
  patient: {
    name: string;
    uhid: string;
  };
  items: PrescriptionItem[];
}

export default function DispenseActions({ prescription }: { prescription: Prescription }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDispense = async () => {
    if (!confirm(`Confirm dispensing medicines for prescription ${prescription.dispenseNo}? This will deduct inventory items.`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pharmacy/prescriptions/${prescription.id}/dispense`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to dispense prescription");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const isPending = prescription.status === "PENDING";
  const isDispensed = prescription.status === "DISPENSED";

  return (
    <div className="flex flex-col gap-1 items-end">
      {error && (
        <span className="text-[11px] text-danger flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}

      <div className="flex items-center gap-2">
        {isPending && (
          <button
            onClick={handleDispense}
            disabled={loading}
            className="btn btn-sm bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 text-xs shadow-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {loading ? "Dispensing..." : "Dispense"}
          </button>
        )}

        {isDispensed && (
          <Link
            href={`/billing/invoices/new?patientId=${prescription.patientId}`}
            className="btn btn-sm btn-secondary flex items-center gap-1 text-xs"
            title="Create hospital invoice for these dispensed medicines"
          >
            <Receipt className="h-3.5 w-3.5" />
            Bill Patient
          </Link>
        )}
      </div>
    </div>
  );
}
