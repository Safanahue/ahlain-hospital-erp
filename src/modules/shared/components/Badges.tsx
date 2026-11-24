type Tone = "success" | "warning" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

const INVOICE_TONES: Record<string, Tone> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  UNPAID: "danger",
  CANCELLED: "neutral",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PAID: "Paid",
    PARTIALLY_PAID: "Partially paid",
    UNPAID: "Unpaid",
    CANCELLED: "Cancelled",
  };
  return (
    <StatusBadge
      label={labels[status] ?? status}
      tone={INVOICE_TONES[status] ?? "neutral"}
    />
  );
}

const PAYMENT_TONES: Record<string, Tone> = {
  SUCCESS: "success",
  PENDING: "warning",
  FAILED: "danger",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    SUCCESS: "Success",
    PENDING: "Pending",
    FAILED: "Failed",
  };
  return (
    <StatusBadge
      label={labels[status] ?? status}
      tone={PAYMENT_TONES[status] ?? "neutral"}
    />
  );
}

const REFUND_TONES: Record<string, Tone> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

export function RefundStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    APPROVED: "Approved",
    PENDING: "Pending approval",
    REJECTED: "Rejected",
  };
  return (
    <StatusBadge
      label={labels[status] ?? status}
      tone={REFUND_TONES[status] ?? "neutral"}
    />
  );
}

const RECON_TONES: Record<string, Tone> = {
  RECONCILED: "success",
  PENDING: "warning",
  MISMATCH: "danger",
};

export function ReconciliationBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    RECONCILED: "Reconciled",
    PENDING: "Pending",
    MISMATCH: "Mismatch",
  };
  return (
    <StatusBadge
      label={labels[status] ?? status}
      tone={RECON_TONES[status] ?? "neutral"}
    />
  );
}
