import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import {
  medicineListQuerySchema,
  prescriptionListQuerySchema,
  medicineCategories,
  LOW_STOCK_THRESHOLD,
  NEAR_EXPIRY_DAYS,
} from "@/modules/pharmacy/schemas";
import {
  listMedicinesPaged,
  listPrescriptionsPaged,
  mapInvoicesToPrescriptions,
  getPharmacyStats,
} from "@/modules/pharmacy/queries";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import Pagination from "@/modules/shared/components/Pagination";
import NewMedicineModal from "./NewMedicineModal";
import NewPrescriptionModal from "./NewPrescriptionModal";
import DispenseActions from "./DispenseActions";
import StockActionsModal from "./StockActionsModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pill,
  AlertTriangle,
  Clock,
  CheckCircle,
  Package,
  Layers,
  Search,
  TrendingDown,
  CalendarClock,
  XOctagon,
} from "lucide-react";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function RxStatusBadge({ status }: { status: string }) {
  if (status === "DISPENSED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
        <CheckCircle className="h-3 w-3" />
        Dispensed
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning">
      <Clock className="h-3 w-3" />
      Pending dispense
    </span>
  );
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export default async function PharmacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("pharmacy.access");
  const sp = await searchParams;

  const rxParsed = prescriptionListQuerySchema.safeParse({
    page: first(sp.rxPage) ?? "1",
    pageSize: "20",
    q: first(sp.rxQ),
    status: first(sp.rxStatus) ?? "ALL",
    from: first(sp.rxFrom),
    to: first(sp.rxTo),
  });
  const rxQuery = rxParsed.success
    ? rxParsed.data
    : prescriptionListQuerySchema.parse({ page: 1, pageSize: 20 });

  const medicineParsed = medicineListQuerySchema.safeParse({
    page: first(sp.mPage) ?? "1",
    pageSize: "20",
    q: first(sp.mq),
    category: first(sp.cat),
    stock: first(sp.stock) ?? "all",
    includeInactive: first(sp.inactive),
  });
  const medicineQuery = medicineParsed.success
    ? medicineParsed.data
    : medicineListQuerySchema.parse({ page: 1, pageSize: 20 });

  const [stats, prescriptions, medicines] = await Promise.all([
    getPharmacyStats(),
    listPrescriptionsPaged(rxQuery),
    listMedicinesPaged(medicineQuery),
  ]);
  const invoices = await mapInvoicesToPrescriptions(prescriptions.items);

  const rxFiltered = Boolean(
    rxQuery.q || rxQuery.status !== "ALL" || rxQuery.from || rxQuery.to,
  );
  const medFiltered = Boolean(
    medicineQuery.q || medicineQuery.category || medicineQuery.stock !== "all",
  );

  const today = new Date();
  const nearExpiryLimit = new Date(today.getTime() + NEAR_EXPIRY_DAYS * 86400000);

  // Preserve one section's filters while submitting the other section's form.
  const rxPreserve = {
    rxQ: rxQuery.q,
    rxStatus: rxQuery.status,
    rxFrom: rxQuery.from,
    rxTo: rxQuery.to,
  };
  const medicinePreserve = {
    mq: medicineQuery.q,
    cat: medicineQuery.category,
    stock: medicineQuery.stock === "all" ? undefined : medicineQuery.stock,
    inactive: medicineQuery.includeInactive ? "1" : undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
            <Pill className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy dark:text-slate-100">Pharmacy & Stock</h1>
            <p className="page-note text-xs">
              Medicine inventory, prescriptions, dispensing and pharmacy billing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NewMedicineModal />
          <NewPrescriptionModal />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: "Medicines in catalogue",
            value: stats.catalogueItems,
            note: "Active items",
            Icon: Package,
            tone: "text-teal-600",
          },
          {
            label: "Units in stock",
            value: stats.stockUnits,
            note: "All active items",
            Icon: Layers,
            tone: "text-navy",
          },
          {
            label: "Low stock",
            value: stats.lowStock,
            note: `Below ${LOW_STOCK_THRESHOLD} units`,
            Icon: AlertTriangle,
            tone: "text-amber-500",
          },
          {
            label: "Out of stock",
            value: stats.outOfStock,
            note: "Zero units",
            Icon: XOctagon,
            tone: "text-danger",
          },
          {
            label: "Expiring soon",
            value: stats.expiringSoon,
            note: `Within ${NEAR_EXPIRY_DAYS} days`,
            Icon: CalendarClock,
            tone: "text-orange-500",
          },
          {
            label: "Pending dispense",
            value: stats.pendingPrescriptions,
            note: "Waiting at the counter",
            Icon: Clock,
            tone: "text-blue-500",
          },
        ].map(({ label, value, note, Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-navy dark:text-slate-100">{value}</p>
            <span className="text-[11px] text-muted-foreground">{note}</span>
          </div>
        ))}
      </div>

      {/* Prescription queue */}
      <section className="card overflow-hidden">
        <div className="card-header flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="card-title text-base font-semibold text-navy dark:text-slate-100">
              Prescription Dispensing Queue
            </h2>
            <p className="card-subtitle text-xs text-muted-foreground">
              {prescriptions.total} prescription{prescriptions.total === 1 ? "" : "s"}
              {rxFiltered ? " matching your filters" : " on record"} · dispensing deducts stock and
              creates the pharmacy invoice
            </p>
          </div>
        </div>

        <form method="GET" action="/pharmacy" className="flex flex-wrap items-end gap-3 p-4">
          {Object.entries(medicinePreserve).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <div className="min-w-[220px] flex-1">
            <label htmlFor="rxQ" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="rxQ"
                name="rxQ"
                type="search"
                defaultValue={rxQuery.q ?? ""}
                placeholder="Dispense no, patient name, UHID or phone"
                className="input w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label htmlFor="rxStatus" className="field-label">
              Status
            </label>
            <select
              id="rxStatus"
              name="rxStatus"
              defaultValue={rxQuery.status}
              className="input"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending dispense</option>
              <option value="DISPENSED">Dispensed</option>
              <option value="CANCELLED">Cancelled / returned</option>
            </select>
          </div>
          <div>
            <label htmlFor="rxFrom" className="field-label">
              From
            </label>
            <input
              id="rxFrom"
              name="rxFrom"
              type="date"
              defaultValue={rxQuery.from ?? ""}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="rxTo" className="field-label">
              To
            </label>
            <input
              id="rxTo"
              name="rxTo"
              type="date"
              defaultValue={rxQuery.to ?? ""}
              className="input"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {rxFiltered ? (
              <Link href="/pharmacy" className="btn btn-secondary">
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {prescriptions.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Pill className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-700" />
            {rxFiltered
              ? "No prescriptions match these filters."
              : "No prescriptions issued yet. Click New Prescription to write the first doctor order."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Dispense no</TableHead>
                  <TableHead className="w-48">Patient</TableHead>
                  <TableHead>Prescribed medications</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-28">Invoice</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-44 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions.items.map((rx) => {
                  const invoice = invoices.get(rx.id) ?? null;
                  return (
                    <TableRow key={rx.id}>
                      <TableCell className="font-mono text-xs font-semibold text-navy dark:text-slate-200">
                        <div>{rx.dispenseNo}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {formatDate(rx.createdAt)} {formatTime(rx.createdAt)}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/patients/${rx.patient.id}`}
                          className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                        >
                          {rx.patient.name}
                        </Link>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {rx.patient.uhid}
                        </div>
                        {rx.prescribedBy && (
                          <div className="text-[10px] text-slate-500">By: {rx.prescribedBy}</div>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          {rx.items.map((item) => {
                            const short = item.medicine.stockQuantity < item.quantity;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                              >
                                <span className="font-medium">{item.medicine.name}</span>
                                <span className="rounded bg-slate-100 px-1 py-0.2 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  Qty: {item.quantity}
                                </span>
                                {item.dosage && (
                                  <span className="text-[11px] italic text-slate-500">
                                    ({item.dosage})
                                  </span>
                                )}
                                {rx.status === "PENDING" && short && (
                                  <span className="text-[10px] font-medium text-danger">
                                    only {item.medicine.stockQuantity} in stock
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {rx.instructions && (
                            <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                              Note: {rx.instructions}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right text-xs font-medium">
                        {formatINR(rx.totalPaise)}
                      </TableCell>

                      <TableCell className="text-xs">
                        {invoice ? (
                          <Link
                            href={`/billing/invoices/${invoice.id}`}
                            className="text-medical hover:underline"
                          >
                            {invoice.invoiceNo}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <RxStatusBadge status={rx.status} />
                        {rx.dispensedBy && rx.dispensedAt && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            by {rx.dispensedBy.name}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <DispenseActions
                          prescription={{
                            id: rx.id,
                            dispenseNo: rx.dispenseNo,
                            status: rx.status,
                            totalPaise: rx.totalPaise,
                            patientId: rx.patientId,
                            patient: { name: rx.patient.name, uhid: rx.patient.uhid },
                          }}
                          invoice={invoice ? { id: invoice.id, invoiceNo: invoice.invoiceNo } : null}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Pagination
          basePath="/pharmacy"
          pageParam="rxPage"
          query={{ ...rxPreserve, ...medicinePreserve }}
          page={prescriptions.page}
          totalPages={prescriptions.totalPages}
          total={prescriptions.total}
          pageSize={prescriptions.pageSize}
        />
      </section>

      {/* Medicine inventory */}
      <section className="card overflow-hidden">
        <div className="card-header flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="card-title text-base font-semibold text-navy dark:text-slate-100">
                Medicine Inventory & Stock Register
              </h2>
              <p className="card-subtitle text-xs text-muted-foreground">
                {medicines.total} item{medicines.total === 1 ? "" : "s"}
                {medFiltered ? " matching your filters" : " registered"} · receive stock, adjust
                counts and review every movement
              </p>
            </div>
          </div>
        </div>

        <form method="GET" action="/pharmacy" className="flex flex-wrap items-end gap-3 p-4">
          {Object.entries(rxPreserve).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <div className="min-w-[220px] flex-1">
            <label htmlFor="mq" className="field-label">
              Search medicine
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="mq"
                name="mq"
                type="search"
                defaultValue={medicineQuery.q ?? ""}
                placeholder="Name, item code, batch or manufacturer"
                className="input w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label htmlFor="cat" className="field-label">
              Category
            </label>
            <select id="cat" name="cat" defaultValue={medicineQuery.category ?? ""} className="input">
              <option value="">All categories</option>
              {medicineCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stock" className="field-label">
              Stock
            </label>
            <select id="stock" name="stock" defaultValue={medicineQuery.stock} className="input">
              <option value="all">All stock levels</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="expiring">Expiring soon</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              name="inactive"
              value="1"
              defaultChecked={medicineQuery.includeInactive}
              className="h-3.5 w-3.5"
            />
            Include deactivated items
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {medFiltered ? (
              <Link href="/pharmacy" className="btn btn-secondary">
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Item code</TableHead>
                <TableHead>Medicine name</TableHead>
                <TableHead className="w-28">Category</TableHead>
                <TableHead className="w-32">Batch no</TableHead>
                <TableHead className="w-32">Expiry</TableHead>
                <TableHead className="w-28 text-right">Unit price</TableHead>
                <TableHead className="w-28 text-right">Stock</TableHead>
                <TableHead className="w-24 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicines.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">No medicines found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {medFiltered
                        ? "Try a different search or stock filter."
                        : "Add the first medicine to the catalogue to start tracking stock."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                medicines.items.map((medicine) => {
                  const expiry = new Date(medicine.expiryDate);
                  const expired = expiry < today;
                  const nearExpiry = !expired && expiry <= nearExpiryLimit;
                  const low = medicine.stockQuantity > 0 && medicine.stockQuantity < LOW_STOCK_THRESHOLD;
                  const out = medicine.stockQuantity <= 0;

                  return (
                    <TableRow key={medicine.id}>
                      <TableCell className="font-mono text-xs font-semibold text-navy dark:text-slate-200">
                        {medicine.itemCode}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          {medicine.name}
                          {!medicine.active && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              inactive
                            </span>
                          )}
                        </div>
                        {medicine.manufacturer && (
                          <div className="text-[10px] text-muted-foreground">
                            {medicine.manufacturer}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {medicine.category}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {medicine.batchNumber}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={expired ? "font-medium text-danger" : ""}>
                          {formatDate(expiry)}
                        </span>
                        {expired && (
                          <div className="text-[10px] font-medium text-danger">expired</div>
                        )}
                        {nearExpiry && (
                          <div className="text-[10px] font-medium text-warning">expiring soon</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {formatINR(medicine.unitPricePaise)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            out
                              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              : low
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {low && <TrendingDown className="h-3 w-3" />}
                          {medicine.stockQuantity} units
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <StockActionsModal
                          medicine={{
                            id: medicine.id,
                            itemCode: medicine.itemCode,
                            name: medicine.name,
                            category: medicine.category,
                            batchNumber: medicine.batchNumber,
                            expiryDate: medicine.expiryDate.toISOString(),
                            stockQuantity: medicine.stockQuantity,
                            unitPricePaise: medicine.unitPricePaise,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          basePath="/pharmacy"
          pageParam="mPage"
          query={{ ...rxPreserve, ...medicinePreserve }}
          page={medicines.page}
          totalPages={medicines.totalPages}
          total={medicines.total}
          pageSize={medicines.pageSize}
        />
      </section>
    </div>
  );
}
