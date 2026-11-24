import Link from "next/link";
import { formatDateTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
  ReconciliationBadge,
} from "@/modules/shared/components/Badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type HistoryPayment = {
  id: string;
  receiptNo: string;
  createdAt: Date | string;
  method: string;
  amount: number;
  status: string;
  transactionRef: string | null;
  reconciliationStatus?: string;
  collector?: { name: string } | null;
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
};

/**
 * Payment history table (bottom of Collect Payment and Invoice detail).
 * Columns: Date & Time, Transaction ID, Method, Amount, Status, Collected By.
 */
export default function PaymentHistoryTable({
  payments,
  showReconciliation = false,
  emptyMessage = "No payments recorded yet.",
}: {
  payments: HistoryPayment[];
  showReconciliation?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date &amp; time</TableHead>
          <TableHead>Transaction ID</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          {showReconciliation ? <TableHead>Reconciliation</TableHead> : null}
          <TableHead>Collected by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={showReconciliation ? 7 : 6}
              className="py-10 text-center text-sm text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="whitespace-nowrap">
                <p className="text-navy">{formatDateTime(payment.createdAt)}</p>
                <Link
                  href={`/billing/receipts/${payment.id}`}
                  className="text-xs font-medium text-medical hover:underline"
                >
                  {payment.receiptNo}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-navy">
                {payment.transactionRef ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {METHOD_LABELS[payment.method] ?? payment.method}
              </TableCell>
              <TableCell className="text-right font-medium text-navy">
                {formatINR(payment.amount)}
              </TableCell>
              <TableCell>
                <PaymentStatusBadge status={payment.status} />
              </TableCell>
              {showReconciliation ? (
                <TableCell>
                  <ReconciliationBadge status={payment.reconciliationStatus ?? "PENDING"} />
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground">
                {payment.collector?.name ?? "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** Small helper used on the invoice detail header. */
export function InvoiceMetaBadges({
  status,
  department,
  billType,
}: {
  status: string;
  department: string;
  billType: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InvoiceStatusBadge status={status} />
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {department}
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {billType}
      </span>
    </div>
  );
}
