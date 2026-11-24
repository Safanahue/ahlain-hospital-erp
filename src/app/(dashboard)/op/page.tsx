import Link from "next/link";
import { requirePagePermission } from "@/modules/auth/guards";
import { listOpVisits } from "@/modules/op/service";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/modules/shared/datetime";
import NewOpVisitForm from "./NewOpVisitForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
    CHECK_IN: { label: "Checked In", tone: "neutral" },
    WAITING_ROOM: { label: "In Waiting Room", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
  };
  const tone = map[status] ?? { label: status, tone: "neutral" };
  const toneClass =
    tone.tone === "success"
      ? "bg-success-bg text-success"
      : tone.tone === "warning"
        ? "bg-warning-bg text-warning"
        : tone.tone === "danger"
          ? "bg-danger-bg text-danger"
          : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass}`}>
      {tone.label}
    </span>
  );
}

export default async function OpPage() {
  await requirePagePermission("op.access");

  const today = new Date();
  const [visits, patients, doctors] = await Promise.all([
    listOpVisits(today),
    prisma.patient.findMany({
      take: 100,
      orderBy: { name: "asc" },
      select: { id: true, name: true, uhid: true },
    }),
    prisma.user.findMany({
      where: { role: "DOCTOR", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">OP Management</h1>
          <p className="page-note">
            {visits.length} visit{visits.length === 1 ? "" : "s"} recorded today · Sequential OPD queue
          </p>
        </div>
      </div>

      {/* Register new OP visit */}
      <NewOpVisitForm patients={patients} doctors={doctors} />

      {/* Today's OP Visits Table */}
      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">Today&apos;s OP Queue</h2>
            <p className="card-subtitle">Active and completed consultations for today</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(today)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="[&_tr]:bg-page">
                <TableHead>OPD No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-navy">No OP visits registered today</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Register a walk-in patient encounter using the form above.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                visits.map((visit) => (
                  <TableRow key={visit.id} className="hover:bg-page/50">
                    <TableCell className="font-semibold text-medical">
                      <Link href={`/op/${visit.id}`} className="hover:underline">
                        {visit.opNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-navy">{visit.patient.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {visit.patient.uhid} · {visit.patient.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-navy">{visit.doctor.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {visit.complaint || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatTime(visit.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={visit.status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/op/${visit.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Details
                        </Link>
                        {visit.status === "COMPLETED" ? (
                          <Link
                            href={`/billing/invoices/new?patientId=${visit.patientId}&department=OP`}
                            className="btn btn-primary btn-sm"
                          >
                            Bill
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
