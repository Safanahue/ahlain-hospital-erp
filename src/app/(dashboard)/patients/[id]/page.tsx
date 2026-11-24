import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, IndianRupee, Pencil, Receipt, Wallet } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { getPatientDetail } from "@/modules/patients/queries";
import { formatINR } from "@/modules/shared/money";
import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
} from "@/modules/shared/datetime";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
} from "@/modules/shared/components/Badges";
import StatCard from "@/modules/shared/components/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GENDER_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-navy">{value ?? "—"}</dd>
    </div>
  );
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("patients.view");
  const permissions = await getPermissionsFor(user);
  const { id } = await params;

  const detail = await getPatientDetail(id);
  if (!detail) notFound();

  const { patient, invoices, payments, summary } = detail;
  const canEdit = permissions.has("patients.manage");
  const showBilling = permissions.has("billing.view");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All patients
          </Link>
          <p className="page-note">
            {patient.uhid} · registered {formatDate(patient.createdAt)}
          </p>
        </div>
        {canEdit ? (
          <Link href={`/patients/${patient.id}/edit`} className="btn btn-secondary">
            <Pencil className="h-4 w-4" aria-hidden />
            Edit patient
          </Link>
        ) : null}
      </div>

      <div className={showBilling ? "grid gap-5 lg:grid-cols-2" : ""}>
        {/* Demographics */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{patient.name}</h2>
            <p className="card-subtitle">
              {patient.uhid} · {GENDER_LABELS[patient.gender] ?? patient.gender} ·{" "}
              {patient.age} years
            </p>
          </div>
          <dl className="px-5 pb-4">
            <DetailRow label="UHID" value={patient.uhid} />
            <DetailRow label="Mobile" value={patient.phone} />
            <DetailRow label="Age" value={`${patient.age} years`} />
            <DetailRow
              label="Date of birth"
              value={patient.dob ? formatCalendarDate(patient.dob) : null}
            />
            <DetailRow label="Gender" value={GENDER_LABELS[patient.gender] ?? patient.gender} />
            <DetailRow label="Blood group" value={patient.bloodGroup} />
            <DetailRow label="Address" value={patient.address} />
            <DetailRow
              label="Emergency contact"
              value={
                patient.emergencyContactName || patient.emergencyContactPhone
                  ? [
                      patient.emergencyContactName,
                      patient.emergencyContactPhone,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                      .toString()
                  : null
              }
            />
            <DetailRow label="Registered" value={formatDateTime(patient.createdAt)} />
            <DetailRow
              label="Last updated"
              value={formatDateTime(patient.updatedAt)}
            />
          </dl>
        </section>

        {/* Billing summary — billing-view roles only */}
        {showBilling ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Invoices"
                value={String(summary.invoiceCount)}
                hint="All time"
                icon={Receipt}
                accent="navy"
              />
              <StatCard
                label="Total billed"
                value={formatINR(summary.totalBilled)}
                hint="Cancelled invoices excluded"
                icon={IndianRupee}
                accent="medical"
              />
              <StatCard
                label="Total paid"
                value={formatINR(summary.totalPaid)}
                hint="Successful payments"
                icon={Wallet}
                accent="success"
              />
              <StatCard
                label="Outstanding"
                value={formatINR(summary.outstanding)}
                hint="Recomputed from payments"
                icon={Wallet}
                accent={summary.outstanding > 0 ? "danger" : "success"}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Billing timeline — billing-view roles only */}
      {showBilling ? (
        <>
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Billing history</h2>
              <p className="card-subtitle">
                Invoices from the existing billing module · outstanding is
                recomputed from successful payments
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice no</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center">
                        <p className="text-sm font-medium text-navy">
                          No invoices yet
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Bills for this patient will appear here.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <Link
                            href={`/billing/invoices/${invoice.id}`}
                            className="font-medium text-medical hover:underline"
                          >
                            {invoice.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invoice.department}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invoice.itemCount}
                        </TableCell>
                        <TableCell className="text-right text-navy">
                          {formatINR(invoice.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-navy">
                          {formatINR(invoice.paidAmount)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            invoice.outstanding > 0 && invoice.status !== "CANCELLED"
                              ? "text-danger"
                              : "text-success"
                          }`}
                        >
                          {invoice.status === "CANCELLED"
                            ? "—"
                            : formatINR(invoice.outstanding)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/billing/invoices/${invoice.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            View
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Payments received</h2>
              <p className="card-subtitle">Latest 10 receipts across all invoices</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt no</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center">
                        <p className="text-sm font-medium text-navy">
                          No payments yet
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Receipts will appear here after payments are collected.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium text-navy">
                          {payment.receiptNo}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(payment.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {payment.invoiceNo}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {METHOD_LABELS[payment.method] ?? payment.method}
                        </TableCell>
                        <TableCell className="text-right text-navy">
                          {formatINR(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={payment.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/billing/receipts/${payment.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            Open
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
