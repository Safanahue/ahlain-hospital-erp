import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Printer } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { getInvoiceDetail } from "@/modules/billing/queries";
import { formatINR } from "@/modules/shared/money";
import { formatDate } from "@/modules/shared/datetime";
import PaymentHistoryTable, {
  InvoiceMetaBadges,
} from "@/modules/billing/components/PaymentHistoryTable";
import RefundRequestForm from "@/modules/billing/components/RefundRequestForm";
import { RefundStatusBadge } from "@/modules/shared/components/Badges";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  SERVICE_CHARGES: "Service Charges",
  LABORATORY: "Laboratory",
  PHARMACY: "Pharmacy",
  ROOM_CHARGES: "Room Charges",
  DOCTOR_CONSULTATION: "Doctor Consultation",
  OTHER_CHARGES: "Other Charges",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("billing.view");
  const permissions = await getPermissionsFor(user);
  const { id } = await params;
  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();
  const canCollect =
    permissions.has("billing.collect") &&
    invoice.status !== "CANCELLED" &&
    invoice.outstanding > 0;
  const canRequestRefund =
    permissions.has("billing.collect") && invoice.status !== "CANCELLED";
  const refundablePayments = invoice.payments
    .filter((payment) => payment.status === "SUCCESS")
    .map((payment) => {
      const reserved = invoice.refunds
        .filter(
          (refund) => refund.paymentId === payment.id && refund.status !== "REJECTED",
        )
        .reduce((sum, refund) => sum + refund.amount, 0);
      return {
        id: payment.id,
        receiptNo: payment.receiptNo,
        createdAt: payment.createdAt.toISOString(),
        amount: payment.amount,
        refundable: Math.max(payment.amount - reserved, 0),
      };
    })
    .filter((payment) => payment.refundable > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/billing/invoices"
            aria-label="Back to invoices"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-navy hover:bg-page"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-navy">
                {invoice.invoiceNo}
              </h2>
              <InvoiceMetaBadges
                status={invoice.status}
                department={invoice.department}
                billType={invoice.billType}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(invoice.createdAt)} by {invoice.creator.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/billing/invoices/${invoice.id}/print`}
            className="btn btn-secondary"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print invoice
          </Link>
          {canCollect ? (
            <Link
              href={`/billing/invoices/${invoice.id}/payment`}
              className="btn btn-primary"
            >
              <Banknote className="h-4 w-4" aria-hidden />
              Collect payment
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-5">
        {/* Invoice details */}
        <section className="card">
          <div className="card-header">
            <h3 className="card-title">Invoice details</h3>
          </div>

          <div className="grid grid-cols-4 gap-4 border-b border-line px-5 py-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Patient</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.patient.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Patient ID</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.patient.uhid}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="mt-0.5 font-medium text-navy">{invoice.patient.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Age / Gender
              </p>
              <p className="mt-0.5 font-medium text-navy">
                {invoice.patient.age === 30 ? "—" : invoice.patient.age} · {invoice.patient.gender}
              </p>
            </div>
          </div>

          {/* Line items by category */}
          <div className="px-5 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Line items by category
            </p>
            {invoice.itemsByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This invoice has no line items.
              </p>
            ) : (
              <div className="space-y-4">
                {invoice.itemsByCategory.map((group) => (
                  <div key={group.category}>
                    <p className="mb-1.5 text-sm font-semibold text-navy">
                      {CATEGORY_LABELS[group.category] ?? group.category}
                    </p>
                    <table className="w-full text-sm">
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.id} className="border-b border-line last:border-0">
                            <td className="py-2 text-muted-foreground">
                              {item.description}
                            </td>
                            <td className="py-2 text-right text-navy">
                              {formatINR(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Totals */}
        <section className="card h-fit">
          <div className="card-header">
            <h3 className="card-title">Summary</h3>
          </div>
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium text-navy">
                {formatINR(invoice.totalAmount)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd className="font-medium text-success">
                {formatINR(invoice.netPaid)}
              </dd>
            </div>
            {invoice.refundedAmount > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Refunded</dt>
                <dd className="font-medium text-danger">
                  −{formatINR(invoice.refundedAmount)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-line pt-3">
              <dt className="font-medium text-navy">Outstanding</dt>
              <dd
                className={`text-base font-semibold ${
                  invoice.outstanding > 0 ? "text-danger" : "text-success"
                }`}
              >
                {formatINR(invoice.outstanding)}
              </dd>
            </div>
          </dl>
          <div className="border-t border-line px-5 py-4">
            <InvoiceMetaBadges
              status={invoice.status}
              department={invoice.department}
              billType={invoice.billType}
            />
          </div>
        </section>
      </div>

      {/* Refunds */}
      <section className="card">
        <div className="card-header">
          <h3 className="card-title">Refunds</h3>
          <p className="card-subtitle">
            Refunds reserve the amount immediately and change the balance once
            finance approves them.
          </p>
        </div>

        {invoice.refunds.length > 0 ? (
          <div className="overflow-x-auto border-b border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Refund no</th>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Reason</th>
                  <th className="px-5 py-2 font-medium">Requested by</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Decided by</th>
                </tr>
              </thead>
              <tbody>
                {invoice.refunds.map((refund) => (
                  <tr key={refund.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-navy">
                      {refund.refundNo}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {formatDate(refund.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-navy">
                      {formatINR(refund.amount)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{refund.reason}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {refund.requestedBy.name}
                    </td>
                    <td className="px-5 py-3">
                      <RefundStatusBadge status={refund.status} />
                      {refund.rejectionNote && refund.status === "REJECTED" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {refund.rejectionNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {refund.approvedBy?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canRequestRefund ? (
          <RefundRequestForm payments={refundablePayments} />
        ) : invoice.refunds.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            No refunds on this invoice.
          </p>
        ) : null}
      </section>

      {/* Payment history */}
      <section className="card">
        <div className="card-header">
          <h3 className="card-title">Payment history</h3>
        </div>
        <div className="overflow-x-auto">
          <PaymentHistoryTable payments={invoice.payments} />
        </div>
      </section>
    </div>
  );
}
