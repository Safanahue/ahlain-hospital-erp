import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { prisma } from "@/lib/prisma";
import { getPatientClinicalHistory } from "@/modules/patients/history";
import { ageFromDob } from "@/modules/patients/schemas";
import { formatINR } from "@/modules/shared/money";
import { formatCalendarDate, formatDate, formatDateTime } from "@/modules/shared/datetime";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/modules/shared/components/Badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GENDER_LABELS: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

/**
 * Legacy imported patients carry a placeholder age of 30 with no date of birth.
 * Printing "30 years" would state a clinical fact the record does not contain, so
 * it is shown as unknown instead.
 */
function displayAge(
  patient: { dob: Date | null; age: number | null },
  options?: { empty?: string },
): string {
  const empty = options?.empty ?? "—";
  if (patient.dob) return `${ageFromDob(patient.dob)} years`;
  if (!patient.age || patient.age === 30) return empty;
  return `${patient.age} years`;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "op", label: "OP visits" },
  { key: "ip", label: "IP admissions" },
  { key: "lab", label: "Laboratory" },
  { key: "pharmacy", label: "Medicines" },
  { key: "billing", label: "Billing" },
  { key: "timeline", label: "Timeline" },
] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-navy">{value ?? "—"}</dd>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium text-navy">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePagePermission("patients.view");
  const permissions = await getPermissionsFor(user);
  const { id } = await params;
  const sp = await searchParams;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  const history = await getPatientClinicalHistory(id);
  const canEdit = permissions.has("patients.manage");
  const showBilling = permissions.has("billing.view");
  const showLab = permissions.has("lab.access");

  const tabParam = first(sp.tab);
  const tab = TABS.some((item) => item.key === tabParam) ? (tabParam as string) : "overview";

  const totalBilled = history.invoiceRows
    .filter((invoice) => invoice.status !== "CANCELLED")
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const totalPaid = history.invoiceRows
    .filter((invoice) => invoice.status !== "CANCELLED")
    .reduce((sum, invoice) => sum + invoice.paidAmount, 0);

  const prescribedItems = history.prescriptions.flatMap((prescription) =>
    prescription.items.map((item) => ({
      prescriptionId: prescription.id,
      dispenseNo: prescription.dispenseNo,
      status: prescription.status,
      date: prescription.createdAt,
      prescribedBy: prescription.prescribedBy,
      medicineName: item.medicine.name,
      medicineCode: item.medicine.itemCode,
      batchNumber: item.medicine.batchNumber,
      quantity: item.quantity,
      dispensed: item.dispensedQuantity,
      returned: item.returnedQuantity,
      unitPricePaise: item.unitPricePaise,
      totalPaise: item.totalPaise,
      dosage: item.dosage,
    })),
  );
  const returnedItems = prescribedItems.filter((item) => item.returned > 0);
  const cancelledPrescriptions = history.prescriptions.filter(
    (prescription) => prescription.status === "CANCELLED",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All patients
          </Link>
          <p className="page-note">{patient.uhid}</p>
        </div>
        {canEdit ? (
          <Link href={`/patients/${patient.id}/edit`} className="btn btn-secondary">
            <Pencil className="h-4 w-4" aria-hidden />
            Edit patient
          </Link>
        ) : null}
      </div>

      <section className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="card-title text-lg">{patient.name}</h1>
            <p className="card-subtitle">
              {patient.uhid} · {GENDER_LABELS[patient.gender] ?? patient.gender} ·{" "}
              {displayAge(patient)} · registered {formatDate(patient.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">
              {history.opVisits.length} OP visits
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {history.admissions.length} admissions
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {history.labOrders.length} lab accessions
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {history.prescriptions.length} prescriptions
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              {history.invoiceRows.length} invoices
            </span>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
          {TABS.filter((item) => {
            if (item.key === "billing") return showBilling;
            if (item.key === "lab") return showLab;
            return true;
          }).map((item) => (
            <Link
              key={item.key}
              href={`/patients/${patient.id}?tab=${item.key}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === item.key ? "bg-navy text-white" : "text-navy hover:bg-page"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <div className="card-header">
              <h2 className="card-title">Patient information</h2>
              <p className="card-subtitle">As recorded at registration</p>
            </div>
            <dl className="px-5 pb-4">
              <DetailRow label="UHID" value={patient.uhid} />
              <DetailRow label="Mobile" value={patient.phone} />
              <DetailRow
                label="Age"
                value={displayAge(patient, { empty: "Not recorded" })}
              />
              <DetailRow
                label="Date of birth"
                value={patient.dob ? formatCalendarDate(patient.dob) : "Not recorded"}
              />
              <DetailRow label="Gender" value={GENDER_LABELS[patient.gender] ?? patient.gender} />
              <DetailRow label="Blood group" value={patient.bloodGroup} />
              <DetailRow label="Address" value={patient.address} />
              <DetailRow
                label="Emergency contact"
                value={
                  patient.emergencyContactName || patient.emergencyContactPhone
                    ? [patient.emergencyContactName, patient.emergencyContactPhone]
                        .filter(Boolean)
                        .join(" · ")
                    : "Not recorded"
                }
              />
              <DetailRow label="Registered" value={formatDateTime(patient.createdAt)} />
              <DetailRow label="Last updated" value={formatDateTime(patient.updatedAt)} />
            </dl>
          </section>

          <div className="space-y-4">
            <div className="card px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Total billed
              </p>
              <p className="mt-1 text-xl font-bold text-navy">{formatINR(totalBilled)}</p>
              <p className="text-xs text-muted-foreground">
                Paid {formatINR(totalPaid)} · outstanding{" "}
                {formatINR(Math.max(0, totalBilled - totalPaid))}
              </p>
            </div>
            <div className="card px-5 py-4 text-xs text-muted-foreground">
              <p className="font-semibold text-navy">Latest activity</p>
              {history.timeline.slice(0, 5).map((event) => (
                <p key={`${event.type}-${event.date.toISOString()}-${event.title}`} className="mt-1.5">
                  <span className="font-medium text-navy">{event.title}</span> ·{" "}
                  {formatDate(event.date)}
                </p>
              ))}
              {history.timeline.length === 0 ? (
                <p className="mt-1.5">No clinical activity recorded yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "op" ? (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">OP visits</h2>
            <p className="card-subtitle">Every outpatient encounter recorded for this patient</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OP number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.opVisits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Empty title="No OP visits" hint="Outpatient consultations will appear here." />
                    </TableCell>
                  </TableRow>
                ) : (
                  history.opVisits.map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell className="font-medium text-navy">{visit.opNo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(visit.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{visit.doctor.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {visit.provisionalDiagnosis ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {visit.treatmentPlan ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{visit.status}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {tab === "ip" ? (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">IP admissions</h2>
            <p className="card-subtitle">Admissions, discharge details and the IP invoice</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Admitted</TableHead>
                  <TableHead>Discharged</TableHead>
                  <TableHead>Ward / Bed</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.admissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Empty
                        title="No inpatient admissions"
                        hint="The source records contain no admission for this patient."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  history.admissions.map((admission) => (
                    <TableRow key={admission.id}>
                      <TableCell className="font-medium text-navy">{admission.admissionNo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(admission.admissionDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {admission.dischargeDate ? formatDateTime(admission.dischargeDate) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {admission.ward} / {admission.bed.bedNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{admission.diagnosis}</TableCell>
                      <TableCell>
                        {admission.invoice ? (
                          <Link
                            href={`/billing/invoices/${admission.invoice.id}`}
                            className="font-medium text-medical hover:underline"
                          >
                            {admission.invoice.invoiceNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{admission.status}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {tab === "lab" ? (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Laboratory history</h2>
            <p className="card-subtitle">
              Accessions, results and archived report files · {history.labOrders.length} records
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Accession</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.labOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Empty
                        title="No laboratory records"
                        hint="Lab accessions for this patient will appear here once registered or imported."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  history.labOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium text-navy">{order.orderNo}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {order.tests.length ? order.tests.map((test) => test.testName).join(", ") : order.testName}
                        <span className="block text-[10px]">{order.department ?? ""}</span>
                      </TableCell>
                      <TableCell className="max-w-[240px] text-xs">
                        {order.results.length === 0 ? (
                          <span className="italic text-muted-foreground">Awaiting analysis</span>
                        ) : (
                          order.results.slice(0, 4).map((row) => (
                            <span key={row.id} className="block font-mono">
                              {row.parameterName}: {row.resultValue} {row.unit ?? ""}
                              {row.flag === "HIGH" ? " ↑" : row.flag === "LOW" ? " ↓" : ""}
                            </span>
                          ))
                        )}
                        {order.results.length > 4 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{order.results.length - 4} more
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {order.invoice ? (
                          <Link
                            href={`/billing/invoices/${order.invoice.id}`}
                            className="font-medium text-medical hover:underline"
                          >
                            {order.invoice.invoiceNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{order.status}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <a
                          href={`/api/laboratory/orders/${order.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                        >
                          <FileText className="h-3 w-3" aria-hidden /> PDF
                        </a>
                        {order.documents.map((document) => (
                          <a
                            key={document.id}
                            href={`/api/laboratory/reports/${document.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-[10px] font-medium text-medical hover:underline"
                          >
                            archived
                          </a>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {tab === "pharmacy" ? (
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Prescribed medicines</h2>
              <p className="card-subtitle">
                A prescription is not proof of purchase — dispensed quantities come from the pharmacy
                transaction.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prescription</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Dosage</TableHead>
                    <TableHead className="text-right">Prescribed</TableHead>
                    <TableHead className="text-right">Dispensed</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescribedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <Empty
                          title="No prescriptions"
                          hint="Medicines prescribed by doctors will appear here."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    prescribedItems.map((item) => (
                      <TableRow key={`${item.prescriptionId}-${item.medicineCode}-${item.medicineName}`}>
                        <TableCell className="font-medium text-navy">{item.dispenseNo}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(item.date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.medicineName}
                          <span className="block text-[10px]">{item.medicineCode}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.dosage ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-navy">{item.quantity}</TableCell>
                        <TableCell className="text-right text-navy">{item.dispensed}</TableCell>
                        <TableCell className="text-right text-navy">{item.returned}</TableCell>
                        <TableCell className="text-right text-navy">
                          {formatINR(item.totalPaise)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.status}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Dispensed / purchased</h2>
                <p className="card-subtitle">Only lines actually dispensed through the pharmacy</p>
              </div>
              <ul className="divide-y divide-line px-5 pb-4 text-xs">
                {history.dispensedItems.length === 0 ? (
                  <li className="py-6 text-muted-foreground">No dispensing recorded.</li>
                ) : (
                  history.dispensedItems.map((item) => (
                    <li
                      key={`${item.prescriptionId}-${item.medicineCode}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span>
                        <span className="font-medium text-navy">{item.medicineName}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {item.dispenseNo} · batch {item.batchNumber} ·{" "}
                          {item.dispensedAt ? formatDate(item.dispensedAt) : "—"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="font-medium text-navy">
                          {item.dispensedQuantity} × {formatINR(item.unitPricePaise)}
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Returns &amp; cancellations</h2>
                <p className="card-subtitle">Reversed pharmacy transactions</p>
              </div>
              <ul className="divide-y divide-line px-5 pb-4 text-xs">
                {returnedItems.length === 0 && cancelledPrescriptions.length === 0 ? (
                  <li className="py-6 text-muted-foreground">No returns or cancellations.</li>
                ) : null}
                {returnedItems.map((item) => (
                  <li key={`return-${item.prescriptionId}-${item.medicineCode}`} className="py-2">
                    <span className="font-medium text-navy">{item.medicineName}</span> returned{" "}
                    {item.returned} unit(s) · {item.dispenseNo}
                  </li>
                ))}
                {cancelledPrescriptions.map((prescription) => (
                  <li key={prescription.id} className="py-2">
                    <span className="font-medium text-danger">
                      Cancelled {prescription.dispenseNo}
                    </span>{" "}
                    · {formatDate(prescription.createdAt)}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "billing" && showBilling ? (
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Invoices</h2>
              <p className="card-subtitle">
                OP, IP, lab and pharmacy bills for this patient · outstanding recomputed from
                successful payments
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.invoiceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Empty title="No invoices" hint="Billing records will appear here." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.invoiceRows.map((invoice) => (
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
                          {invoice.serviceType}
                        </TableCell>
                        <TableCell className="max-w-[260px] text-[11px] text-muted-foreground">
                          {invoice.items.map((item) => item.description).join(" · ")}
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
                          {invoice.status === "CANCELLED" ? "—" : formatINR(invoice.outstanding)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Receipts &amp; payments</h2>
              <p className="card-subtitle">
                {history.payments.length} payment{history.payments.length === 1 ? "" : "s"} recorded
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Empty title="No payments" hint="Collected receipts will appear here." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium text-navy">{payment.receiptNo}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(payment.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{payment.invoiceNo}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.method}</TableCell>
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
        </div>
      ) : null}

      {tab === "timeline" ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Patient timeline</h2>
            <p className="card-subtitle">
              {history.timeline.length} events, newest first · only recorded events are shown
            </p>
          </div>
          <ol className="space-y-0 px-5 pb-5">
            {history.timeline.length === 0 ? (
              <li className="py-8 text-sm text-muted-foreground">No events recorded yet.</li>
            ) : (
              history.timeline.map((event) => (
                <li
                  key={`${event.type}-${event.date.toISOString()}-${event.title}`}
                  className="flex gap-4 border-l border-line py-3 pl-4"
                >
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {formatDate(event.date)}
                  </span>
                  <span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-medical">
                      {event.type}
                    </span>
                    <span className="block text-sm font-medium text-navy">
                      {event.href ? (
                        <Link href={event.href} className="hover:underline">
                          {event.title}
                        </Link>
                      ) : (
                        event.title
                      )}
                    </span>
                    {event.detail ? (
                      <span className="block text-xs text-muted-foreground">{event.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
