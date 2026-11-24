import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getPermissionsFor, requirePagePermission } from "@/modules/auth/guards";
import { getHospitalSettings, getPaymentForReceipt } from "@/modules/billing/queries";
import { computeOutstanding } from "@/modules/billing/service";
import { amountInWords, formatINR } from "@/modules/shared/money";
import { formatDateTime } from "@/modules/shared/datetime";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
  ReconciliationBadge,
} from "@/modules/shared/components/Badges";
import ReceiptActions from "@/modules/billing/components/ReceiptActions";
import { receiptFooterText } from "@/modules/billing/templates";
import {
  AuthorisedSignature,
  DocumentMeta,
  DocumentSurface,
  DocumentWatermark,
  HospitalHeader,
} from "@/modules/documents/components";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
};

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requirePagePermission("billing.view");
  const permissions = await getPermissionsFor(user);
  const { paymentId } = await params;
  const { new: isNew } = await searchParams;

  const [payment, settings] = await Promise.all([
    getPaymentForReceipt(paymentId),
    getHospitalSettings(),
  ]);
  if (!payment) notFound();

  const invoice = payment.invoice;
  const successPaid = invoice.payments
    .filter((p) => p.status === "SUCCESS")
    .reduce((sum, p) => sum + p.amount, 0);
  const refunded = invoice.refunds
    .filter((refund) => refund.status === "APPROVED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const totalPaid = Math.max(successPaid - refunded, 0);
  const outstanding = computeOutstanding(invoice.totalAmount, totalPaid);

  const whatsappMessage =
    `AHLAIN HOSPITAL payment receipt ${payment.receiptNo}: ${formatINR(payment.amount)} received for invoice ${invoice.invoiceNo} ` +
    `(${invoice.patient.name}, ${invoice.patient.uhid}). Total paid ${formatINR(totalPaid)}, outstanding ${formatINR(outstanding)}. Thank you!`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/billing/invoices/${invoice.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to invoice
        </Link>
        <ReceiptActions
          paymentId={payment.id}
          whatsappMessage={whatsappMessage}
          patientPhone={invoice.patient.phone}
          canSendSms={permissions.has("billing.collect")}
        />
      </div>

      {isNew === "1" ? (
        <div
          role="status"
          className="no-print flex items-center gap-3 rounded-xl border border-success/30 bg-success-bg px-4 py-3"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-success">
              Payment recorded successfully
            </p>
            <p className="text-xs text-success/90">
              Receipt {payment.receiptNo} · {formatINR(payment.amount)} via{" "}
              {METHOD_LABELS[payment.method] ?? payment.method}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ---------------- Printable receipt (A4) ---------------- */}
        <DocumentSurface id="receipt-area">
          <DocumentWatermark settings={settings} />

          <div className="relative z-10">
            <HospitalHeader settings={settings} title="Payment Receipt" />

            <DocumentMeta
              items={[
                {
                  label: "Receipt Number",
                  value: payment.receiptNo,
                },
                {
                  label: "Receipt Date & Time",
                  value: formatDateTime(payment.createdAt),
                },
                { label: "Invoice Number", value: invoice.invoiceNo },
                { label: "Patient Name", value: invoice.patient.name },
                {
                  label: "Age / Gender",
                  value: `${invoice.patient.age} yrs / ${invoice.patient.gender.charAt(0)}${invoice.patient.gender
                    .slice(1)
                    .toLowerCase()}`,
                },
                { label: "UHID / SID", value: invoice.patient.uhid },
                { label: "Phone Number", value: invoice.patient.phone },
                {
                  label: "Registration Date",
                  value: formatDateTime(invoice.patient.createdAt),
                },
                {
                  label: "Department / Visit Type",
                  value: `${invoice.department} · ${invoice.billType.replaceAll("_", " ")}`,
                },
              ]}
            />

            {/* Payment rows */}
            <table className="mt-4 w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-[#94a3b8] text-left text-[9px] uppercase tracking-[0.08em] text-[#334155]">
                  <th className="py-2 pr-3 font-semibold">Date &amp; time</th>
                  <th className="py-2 pr-3 font-semibold">Transaction ID</th>
                  <th className="py-2 pr-3 font-semibold">Method</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments
                  .filter((p) => p.status === "SUCCESS")
                  .map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-line ${
                        row.id === payment.id ? "bg-[#f1f5f9]" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 text-[#111827]">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[#111827]">
                        {row.receiptNo}
                        {row.transactionRef ? (
                          <span className="block text-[9px] text-muted-foreground">
                            Ref: {row.transactionRef}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-[#111827]">
                        {METHOD_LABELS[row.method] ?? row.method}
                      </td>
                      <td className="py-2 text-right font-medium text-[#111827]">
                        {formatINR(row.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="doc-section mt-4 flex justify-end">
              <div className="w-72 text-[11px]">
                <div className="flex justify-between border-b border-line py-1.5">
                  <span className="text-[#334155]">Amount received</span>
                  <span className="font-semibold text-[#0b2436]">
                    {formatINR(payment.amount)}
                  </span>
                </div>
                {refunded > 0 ? (
                  <div className="flex justify-between border-b border-line py-1.5">
                    <span className="text-[#334155]">Refunded</span>
                    <span className="font-semibold text-danger">
                      − {formatINR(refunded)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between border-b border-line py-1.5">
                  <span className="text-[#334155]">Total paid</span>
                  <span className="font-semibold text-[#0b2436]">
                    {formatINR(totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-line py-1.5">
                  <span className="font-semibold text-[#0b2436]">Balance due</span>
                  <span
                    className={`font-semibold ${
                      outstanding > 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {formatINR(outstanding)}
                  </span>
                </div>
              </div>
            </div>

            <div className="doc-section mt-3 grid grid-cols-3 gap-4 border-t border-line pt-3 text-[10px]">
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  Payment method
                </p>
                <p className="mt-0.5 font-semibold text-[#111827]">
                  {METHOD_LABELS[payment.method] ?? payment.method}
                </p>
              </div>
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  Payment status
                </p>
                <p className="mt-0.5 font-semibold text-[#111827]">
                  {payment.status === "SUCCESS" ? "Paid" : payment.status}
                </p>
              </div>
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  UPI
                </p>
                <p className="mt-0.5 font-semibold text-[#111827]">
                  {settings.upiId}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[10px] text-[#111827]">
              <span className="text-muted-foreground">Amount in words: </span>
              <span className="font-semibold">{amountInWords(payment.amount)}</span>
            </p>

            <div className="doc-signatures mt-8 flex items-end justify-between gap-6">
              <div className="w-56 text-center text-[10.5px] text-[#111827]">
                <div className="h-10" />
                <div className="border-t border-[#94a3b8] pt-1.5">
                  <p className="font-semibold">{payment.collector.name}</p>
                  <p className="text-[9px] text-muted-foreground">Received by</p>
                </div>
              </div>
              <AuthorisedSignature
                settings={settings}
                name={`For ${settings.hospitalName}`}
              />
            </div>

            <p className="mt-6 whitespace-pre-line border-t border-line pt-3 text-center text-[8.5px] leading-snug text-muted-foreground">
              {receiptFooterText(settings.receiptFooter, settings.hospitalName)}
            </p>
          </div>
        </DocumentSurface>

        {/* ---------------- Status card (not printed) ---------------- */}
        <aside className="card no-print h-fit space-y-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Payment status
            </p>
            <div className="mt-1.5">
              <PaymentStatusBadge status={payment.status} />
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reconciliation status
            </p>
            <div className="mt-1.5">
              <ReconciliationBadge status={payment.reconciliationStatus} />
            </div>
            {payment.reconciliationNote ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Note: {payment.reconciliationNote}
              </p>
            ) : null}
            {payment.reconciliationStatus !== "PENDING" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {payment.reconciler?.name
                  ? `Marked by ${payment.reconciler.name}`
                  : null}
                {payment.reconciledAt
                  ? ` on ${formatDateTime(payment.reconciledAt)}`
                  : null}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Awaiting verification against the hospital payment account.
              </p>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Outstanding balance
            </p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                outstanding > 0 ? "text-danger" : "text-success"
              }`}
            >
              {formatINR(outstanding)}
            </p>
            <div className="mt-2">
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="border-t border-line pt-4 text-xs text-muted-foreground">
            <p>
              Method:{" "}
              <span className="font-medium text-navy">
                {METHOD_LABELS[payment.method] ?? payment.method}
              </span>
            </p>
            <p className="mt-1">
              Reference:{" "}
              <span className="font-mono font-medium text-navy">
                {payment.transactionRef ?? "—"}
              </span>
            </p>
            <p className="mt-1">
              Collected by:{" "}
              <span className="font-medium text-navy">
                {payment.collector.name}
              </span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
