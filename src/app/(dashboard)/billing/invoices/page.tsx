import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { invoiceListQuerySchema } from "@/modules/billing/schemas";
import { listInvoices } from "@/modules/billing/queries";
import { formatINR } from "@/modules/shared/money";
import { formatDate } from "@/modules/shared/datetime";
import { InvoiceStatusBadge } from "@/modules/shared/components/Badges";
import Pagination from "@/modules/shared/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

const DEPARTMENT_OPTIONS = [
  { value: "OP", label: "OP" },
  { value: "IP", label: "IP" },
  { value: "LAB", label: "Lab" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "DENTAL", label: "Dental" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = {
    page: first(sp.page) ?? "1",
    pageSize: "12",
    q: first(sp.q),
    status: first(sp.status),
    department: first(sp.department),
    from: first(sp.from),
    to: first(sp.to),
  };

  const parsed = invoiceListQuerySchema.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : invoiceListQuerySchema.parse({ page: 1, pageSize: 12 });

  const user = await requirePagePermission("billing.view");
  const permissions = await getPermissionsFor(user);
  const canCreate = permissions.has("billing.create");

  const result = await listInvoices(query);
  const hasFilters = Boolean(query.q || query.status.length || query.department.length || query.from || query.to);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="page-note">
          {result.total} invoice{result.total === 1 ? "" : "s"}
          {hasFilters ? " matching your filters" : " in total"} · outstanding is
          recomputed from successful payments
        </p>
        {canCreate ? (
          <Link
            href="/billing/invoices/new"
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New invoice
          </Link>
        ) : null}
      </div>

      {/* Filters — submitted as a GET form, applied server-side */}
      <form
        method="GET"
        action="/billing/invoices"
        className="card p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ""}
                placeholder="Invoice no, patient name or UHID"
                className="input w-full pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={query.status.join(",")}
              className="input"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="department" className="field-label">
              Department
            </label>
            <select
              id="department"
              name="department"
              defaultValue={query.department.join(",")}
              className="input"
            >
              <option value="">All departments</option>
              {DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="from" className="field-label">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={query.from ?? ""}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="to" className="field-label">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={query.to ?? ""}
              className="input"
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {hasFilters ? (
              <Link href="/billing/invoices" className="btn btn-secondary">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {/* Invoice table */}
      <section className="card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice no</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Patient ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">
                      No invoices found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Invoices will appear here once they are created."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((invoice) => {
                  const canCollect =
                    canCreate &&
                    (invoice.status === "UNPAID" ||
                      invoice.status === "PARTIALLY_PAID") &&
                    invoice.outstanding > 0;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          href={`/billing/invoices/${invoice.id}`}
                          className="font-medium text-medical hover:underline"
                        >
                          {invoice.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-navy">
                        {invoice.patient.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.patient.uhid}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.department}
                      </TableCell>
                      <TableCell className="text-right text-navy">
                        {formatINR(invoice.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right text-navy">
                        {formatINR(invoice.paidAmount)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          invoice.outstanding > 0 ? "text-danger" : "text-success"
                        }`}
                      >
                        {formatINR(invoice.outstanding)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(invoice.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canCollect ? (
                          <Link
                            href={`/billing/invoices/${invoice.id}/payment`}
                            className="btn btn-medical btn-sm"
                          >
                            Collect payment
                          </Link>
                        ) : (
                          <Link
                            href={`/billing/invoices/${invoice.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            View
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/billing/invoices"
          query={{
            q: query.q,
            status: query.status.join(","),
            department: query.department.join(","),
            from: query.from,
            to: query.to,
          }}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
