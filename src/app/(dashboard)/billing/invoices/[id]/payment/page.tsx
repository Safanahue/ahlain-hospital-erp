import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { getHospitalSettings, getInvoiceDetail } from "@/modules/billing/queries";
import { formatINR } from "@/modules/shared/money";
import PaymentScreen from "@/modules/billing/components/PaymentScreen";
import { resolveUpiQrUrl } from "@/modules/settings/brand";

export const dynamic = "force-dynamic";

export default async function CollectPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("billing.collect");
  const { id } = await params;

  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();

  const settings = await getHospitalSettings();

  const invoicePayload = {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    department: invoice.department,
    billType: invoice.billType,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.successPaid,
    outstanding: invoice.outstanding,
    createdAt: invoice.createdAt,
    patient: {
      name: invoice.patient.name,
      uhid: invoice.patient.uhid,
      phone: invoice.patient.phone,
      age: invoice.patient.age,
      gender: invoice.patient.gender,
    },
    itemsByCategory: invoice.itemsByCategory.map((group) => ({
      category: group.category,
      items: group.items.map((item) => ({
        id: item.id,
        description: item.description,
        amount: item.amount,
      })),
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      receiptNo: payment.receiptNo,
      createdAt: payment.createdAt,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      transactionRef: payment.transactionRef,
      reconciliationStatus: payment.reconciliationStatus,
      collector: payment.collector,
    })),
  };

  const blocked =
    invoice.status === "CANCELLED" || invoice.outstanding <= 0;

  if (blocked) {
    return (
      <div className="space-y-5">
        <BackButton id={invoice.id} />
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h2 className="text-base font-semibold text-navy">
            {invoice.status === "CANCELLED"
              ? "This invoice is cancelled"
              : "This invoice is fully paid"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {invoice.status === "CANCELLED"
              ? "Cancelled invoices cannot accept payments."
              : `Outstanding balance is ${formatINR(0)}. Nothing to collect.`}
          </p>
          <Link
            href={`/billing/invoices/${invoice.id}`}
            className="btn btn-primary mt-5"
          >
            View invoice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackButton id={invoice.id} />
      <PaymentScreen
        invoice={invoicePayload}
        settings={{
          hospitalName: settings.hospitalName,
          upiId: settings.upiId,
          upiQrImageUrl: resolveUpiQrUrl(settings.upiQrImageUrl),
        }}
        collectorName={user.name}
      />
    </div>
  );
}

function BackButton({ id }: { id: string }) {
  return (
    <Link
      href={`/billing/invoices/${id}`}
      className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to invoice
    </Link>
  );
}
