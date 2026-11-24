import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { getHospitalSettings, getInvoiceDetail } from "@/modules/billing/queries";
import { invoiceFooterText, termsBlock } from "@/modules/billing/templates";
import { amountInWords, formatINR } from "@/modules/shared/money";
import { formatDateTime } from "@/modules/shared/datetime";
import PrintActions from "@/modules/shared/components/PrintActions";
import {
  AuthorisedSignature,
  DocumentMeta,
  DocumentSurface,
  DocumentWatermark,
  HospitalHeader,
} from "@/modules/documents/components";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  SERVICE_CHARGES: "Service Charges",
  LABORATORY: "Laboratory",
  PHARMACY: "Pharmacy",
  ROOM_CHARGES: "Room Charges",
  DOCTOR_CONSULTATION: "Doctor Consultation",
  OTHER_CHARGES: "Other Charges",
};

const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Unpaid",
  CANCELLED: "Cancelled",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("billing.view");
  const { id } = await params;

  const [invoice, settings] = await Promise.all([
    getInvoiceDetail(id),
    getHospitalSettings(),
  ]);
  if (!invoice) notFound();

  const terms = termsBlock(settings.termsText);
  const paid = invoice.netPaid;
  const methods = [
    ...new Set(
      invoice.payments
        .filter((payment) => payment.status === "SUCCESS")
        .map((payment) => payment.method.replaceAll("_", " ")),
    ),
  ].join(", ");
  const receipts = invoice.payments
    .filter((payment) => payment.status === "SUCCESS")
    .map((payment) => payment.receiptNo)
    .join(", ");

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/billing/invoices/${invoice.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Invoice {invoice.invoiceNo}
        </Link>
        <PrintActions />
      </div>

      <DocumentSurface>
        <DocumentWatermark settings={settings} />

        <div className="relative z-10">
          <HospitalHeader settings={settings} title="Invoice" />

          <DocumentMeta
            items={[
              { label: "Patient Name", value: invoice.patient.name },
              {
                label: "Age / Gender",
                value: `${invoice.patient.age} yrs / ${invoice.patient.gender.charAt(0)}${invoice.patient.gender
                  .slice(1)
                  .toLowerCase()}`,
              },
              { label: "UHID", value: invoice.patient.uhid },
              { label: "Phone Number", value: invoice.patient.phone },
              {
                label: "Registration Date",
                value: formatDateTime(invoice.patient.createdAt),
              },
              {
                label: "Invoice Date & Time",
                value: formatDateTime(invoice.createdAt),
              },
              { label: "Invoice Number", value: invoice.invoiceNo },
              {
                label: "Department / Visit Type",
                value: `${invoice.department} · ${invoice.billType.replaceAll("_", " ")}`,
              },
              {
                label: "Payment / Receipt No",
                value: receipts || "Not paid yet",
              },
              ...(invoice.admission
                ? [
                    {
                      label: "Admission Number",
                      value: invoice.admission.admissionNo,
                    },
                  ]
                : []),
            ]}
          />

          {/* Billing table */}
          <table className="mt-4 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-[#94a3b8] text-left text-[9px] uppercase tracking-[0.08em] text-[#334155]">
                <th className="py-2 pr-3 font-semibold">Description</th>
                <th className="w-12 py-2 pr-3 text-center font-semibold">Qty</th>
                <th className="w-24 py-2 pr-3 text-right font-semibold">Rate</th>
                <th className="w-24 py-2 pr-3 text-right font-semibold">Discount</th>
                <th className="w-20 py-2 pr-3 text-right font-semibold">Tax</th>
                <th className="w-28 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.itemsByCategory.map((group) => (
                <FragmentRows
                  key={group.category}
                  label={CATEGORY_LABELS[group.category] ?? group.category}
                  rows={group.items.map((item) => ({
                    id: item.id,
                    description: item.description,
                    amount: item.amount,
                  }))}
                />
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="doc-section mt-4 flex justify-end">
            <div className="w-72 text-[11px]">
              <Line label="Subtotal" value={formatINR(invoice.totalAmount)} />
              <Line label="Discount" value={formatINR(0)} />
              <Line label="Tax" value={formatINR(0)} />
              <Line
                label="Grand Total"
                value={formatINR(invoice.totalAmount)}
                strong
              />
              <Line label="Amount Paid" value={formatINR(paid)} />
              {invoice.refundedAmount > 0 ? (
                <Line
                  label="Refunded"
                  value={`− ${formatINR(invoice.refundedAmount)}`}
                />
              ) : null}
              <Line
                label="Outstanding Balance"
                value={formatINR(invoice.outstanding)}
                strong
                tone={invoice.outstanding > 0 ? "danger" : "success"}
              />
            </div>
          </div>

          <div className="doc-section mt-3 grid grid-cols-3 gap-4 border-t border-line pt-3 text-[10px]">
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Payment method
              </p>
              <p className="mt-0.5 font-semibold text-[#111827]">
                {methods || "—"}
              </p>
            </div>
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Payment status
              </p>
              <p className="mt-0.5 font-semibold text-[#111827]">
                {statusLabel(invoice.status)}
              </p>
            </div>
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                UPI
              </p>
              <p className="mt-0.5 font-semibold text-[#111827]">{settings.upiId}</p>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-[#111827]">
            <span className="text-muted-foreground">Amount in words: </span>
            <span className="font-semibold">{amountInWords(invoice.totalAmount)}</span>
          </p>

          {terms ? (
            <div className="doc-section mt-4 border-t border-line pt-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#0b2436]">
                Terms &amp; conditions
              </p>
              <p className="mt-1 whitespace-pre-line text-[9.5px] leading-snug text-[#334155]">
                {terms}
              </p>
            </div>
          ) : null}

          <div className="doc-signatures mt-8 flex items-end justify-between gap-6">
            <p className="max-w-[420px] text-[8.5px] leading-snug text-muted-foreground">
              {invoiceFooterText(settings.receiptFooter, settings.hospitalName)}
            </p>
            <AuthorisedSignature
              settings={settings}
              name={`For ${settings.hospitalName}`}
            />
          </div>
        </div>
      </DocumentSurface>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "danger" | "success";
}) {
  return (
    <div
      className={`flex justify-between border-b border-line py-1.5 ${
        strong ? "font-semibold" : ""
      }`}
    >
      <span className="text-[#334155]">{label}</span>
      <span
        className={`text-[#0b2436] ${
          tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function FragmentRows({
  label,
  rows,
}: {
  label: string;
  rows: { id: string; description: string; amount: number }[];
}) {
  return (
    <>
      <tr className="bg-[#f1f5f9]">
        <td
          colSpan={6}
          className="py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#334155]"
        >
          {label}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-line align-top">
          <td className="py-2 pr-3 text-[#111827]">{row.description}</td>
          <td className="py-2 pr-3 text-center text-[#111827]">1</td>
          <td className="py-2 pr-3 text-right text-[#111827]">
            {formatINR(row.amount)}
          </td>
          <td className="py-2 pr-3 text-right text-[#111827]">—</td>
          <td className="py-2 pr-3 text-right text-[#111827]">—</td>
          <td className="py-2 text-right font-medium text-[#111827]">
            {formatINR(row.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}
