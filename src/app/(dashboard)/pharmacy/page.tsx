import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import { listPrescriptions, listMedicines } from "@/modules/pharmacy/service";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import { formatINR } from "@/modules/shared/money";
import NewMedicineModal from "./NewMedicineModal";
import NewPrescriptionModal from "./NewPrescriptionModal";
import DispenseActions from "./DispenseActions";
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
} from "lucide-react";

export const dynamic = "force-dynamic";

function RxStatusBadge({ status }: { status: string }) {
  if (status === "DISPENSED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-success-bg text-success">
        <CheckCircle className="h-3 w-3" />
        Dispensed
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-danger-bg text-danger">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-bg text-warning">
      <Clock className="h-3 w-3" />
      Pending Dispense
    </span>
  );
}

export default async function PharmacyPage() {
  await requirePagePermission("pharmacy.access");

  const [medicines, prescriptions, patients] = await Promise.all([
    listMedicines(),
    listPrescriptions(),
    prisma.patient.findMany({
      take: 100,
      orderBy: { name: "asc" },
      select: { id: true, name: true, uhid: true },
    }),
  ]);

  const lowStockCount = medicines.filter((m) => m.stockQuantity < 50).length;
  const pendingRxCount = prescriptions.filter((p) => p.status === "PENDING").length;
  const dispensedRxCount = prescriptions.filter((p) => p.status === "DISPENSED").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-teal-50 dark:bg-teal-950 p-2 text-teal-600 dark:text-teal-400">
              <Pill className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-navy dark:text-slate-100">
                Pharmacy & Stock
              </h1>
              <p className="page-note text-xs">
                Medicine inventory control, doctor prescriptions, and live stock dispensing
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NewMedicineModal />
          <NewPrescriptionModal patients={patients} medicines={medicines} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Medicines in Stock</span>
            <Package className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-navy dark:text-slate-100">
            {medicines.length}
          </p>
          <span className="text-[11px] text-muted-foreground">Master catalog items</span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Low Stock Alert</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {lowStockCount}
          </p>
          <span className="text-[11px] text-muted-foreground">Items with &lt; 50 units</span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pending Dispense</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {pendingRxCount}
          </p>
          <span className="text-[11px] text-muted-foreground">Waiting at pharmacy counter</span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Dispensed Prescriptions</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {dispensedRxCount}
          </p>
          <span className="text-[11px] text-muted-foreground">Stock deducted & released</span>
        </div>
      </div>

      {/* Section 1: Prescriptions & Dispensing Queue */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="card-title text-base font-semibold text-navy dark:text-slate-100">
              Prescription Dispensing Queue
            </h2>
            <p className="card-subtitle text-xs text-muted-foreground">
              Review doctor prescriptions, verify doses, and dispense medicines
            </p>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {prescriptions.length} Order{prescriptions.length === 1 ? "" : "s"}
          </span>
        </div>

        {prescriptions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Pill className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
            No prescriptions issued yet. Click <strong>&quot;New Prescription&quot;</strong> above to write the first doctor order.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Dispense No</TableHead>
                  <TableHead className="w-48">Patient</TableHead>
                  <TableHead>Prescribed Medications</TableHead>
                  <TableHead className="w-28 text-right">Total Amount</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-36 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions.map((rx) => (
                  <TableRow key={rx.id}>
                    <TableCell className="font-mono text-xs font-semibold text-navy dark:text-slate-200">
                      <div>{rx.dispenseNo}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {formatDate(rx.createdAt)} {formatTime(rx.createdAt)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Link
                        href={`/patients/${rx.patient.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                      >
                        {rx.patient.name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {rx.patient.uhid}
                      </div>
                      {rx.prescribedBy && (
                        <div className="text-[10px] text-slate-500">
                          By: {rx.prescribedBy}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {rx.items.map((item) => (
                          <div
                            key={item.id}
                            className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                          >
                            <span className="font-medium">{item.medicine.name}</span>
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.2 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                              Qty: {item.quantity}
                            </span>
                            {item.dosage && (
                              <span className="text-[11px] text-slate-500 italic">
                                ({item.dosage})
                              </span>
                            )}
                          </div>
                        ))}
                        {rx.instructions && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                            Note: {rx.instructions}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-medium text-xs">
                      {formatINR(rx.totalPaise)}
                    </TableCell>

                    <TableCell>
                      <RxStatusBadge status={rx.status} />
                      {rx.dispensedBy && rx.dispensedAt && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          by {rx.dispensedBy.name}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <DispenseActions prescription={rx as any} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Section 2: Medicine Inventory & Stock Table */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="card-title text-base font-semibold text-navy dark:text-slate-100">
                Medicine Inventory Catalog
              </h2>
              <p className="card-subtitle text-xs text-muted-foreground">
                Live batch stocks, expiry tracking, and retail pricing
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {medicines.length} registered item{medicines.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Item Code</TableHead>
                <TableHead>Medicine Name</TableHead>
                <TableHead className="w-28">Category</TableHead>
                <TableHead className="w-32">Batch No</TableHead>
                <TableHead className="w-28">Expiry Date</TableHead>
                <TableHead className="w-28 text-right">Unit Price</TableHead>
                <TableHead className="w-28 text-right">Stock Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicines.map((med) => {
                const isLow = med.stockQuantity < 50;
                return (
                  <TableRow key={med.id}>
                    <TableCell className="font-mono text-xs font-semibold text-navy dark:text-slate-200">
                      {med.itemCode}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs text-slate-900 dark:text-slate-100">
                        {med.name}
                      </div>
                      {med.manufacturer && (
                        <div className="text-[10px] text-muted-foreground">
                          {med.manufacturer}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                        {med.category}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {med.batchNumber}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                      {new Date(med.expiryDate).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs">
                      {formatINR(med.unitPricePaise)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isLow
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        {med.stockQuantity} units
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
