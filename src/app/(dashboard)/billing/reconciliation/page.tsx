import Link from "next/link";
import { CheckCircle2, Search } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { reconciliationListQuerySchema } from "@/modules/billing/schemas";
import {
  listPendingReconciliation,
  listPendingRefunds,
} from "@/modules/billing/queries";
import { formatINR } from "@/modules/shared/money";
import { formatDateTime } from "@/modules/shared/datetime";
import Pagination from "@/modules/shared/components/Pagination";
import ReconcileActions from "@/modules/billing/components/ReconcileActions";
import RefundDecision from "@/modules/billing/components/RefundDecision";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("billing.reconcile");
  const sp = await searchParams;

  const parsed = reconciliationListQuerySchema.safeParse({
    page: first(sp.page) ?? "1",
    q: first(sp.q),
  });
  const query = parsed.success
    ? parsed.data
    : reconciliationListQuerySchema.parse({ page: 1 });

  const [result, pendingRefunds] = await Promise.all([
    listPendingReconciliation({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
    }),
    listPendingRefunds(),
  ]);

  const done = first(sp.done);
  const doneResult = first(sp.result);

  return (
    <div className="space-y-5">
      {done && doneResult ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-bg px-4 py-3"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm font-semibold text-success">
            Receipt {done} marked as{" "}
            {doneResult === "MISMATCH" ? "a mismatch" : "reconciled"}.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="page-note">
          {result.total} UPI / bank payment{result.total === 1 ? "" : "s"} waiting
          for reconciliation. Every action is audit logged.
        </p>
        <form method="GET" action="/billing/reconciliation" className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="Receipt, UTR, invoice, patient…"
              aria-label="Search payments"
              className="input w-72 pl-9"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
          >
            Search
          </button>
        </form>
      </div>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title">Refunds waiting for approval</h3>
          <p className="card-subtitle">
            Approving a refund reduces the invoice balance. Rejecting it frees the
            amount for another request.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refund no</TableHead>
                <TableHead>Invoice / patient</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRefunds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No refunds waiting for approval.
                  </TableCell>
                </TableRow>
              ) : (
                pendingRefunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="whitespace-nowrap font-medium text-navy">
                      {refund.refundNo}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/billing/invoices/${refund.invoice.id}`}
                        className="font-medium text-medical hover:underline"
                      >
                        {refund.invoice.invoiceNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {refund.invoice.patient.name} · {refund.invoice.patient.uhid}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {refund.payment.receiptNo}
                    </TableCell>
                    <TableCell className="text-right font-medium text-navy">
                      {formatINR(refund.amount)}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-muted-foreground">
                      {refund.reason}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {refund.requestedBy.name}
                    </TableCell>
                    <TableCell>
                      <RefundDecision
                        refundId={refund.id}
                        refundNo={refund.refundNo}
                        amount={formatINR(refund.amount)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Receipt no</TableHead>
                <TableHead>Invoice / patient</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Transaction ref</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Collected by</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">
                      Nothing to reconcile
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {query.q
                        ? "No payments match your search."
                        : "All UPI and bank payments have been reconciled."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(payment.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/billing/receipts/${payment.id}`}
                        className="font-medium text-medical hover:underline"
                      >
                        {payment.receiptNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-navy">
                        {payment.invoice.invoiceNo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.invoice.patient.name} ·{" "}
                        {payment.invoice.patient.uhid}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {METHOD_LABELS[payment.method] ?? payment.method}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-navy">
                      {payment.transactionRef ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-navy">
                      {formatINR(payment.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.collector.name}
                    </TableCell>
                    <TableCell>
                      <ReconcileActions
                        paymentId={payment.id}
                        receiptNo={payment.receiptNo}
                        amount={formatINR(payment.amount)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/billing/reconciliation"
          query={{ q: query.q }}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
