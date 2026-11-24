import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/modules/auth/guards";
import { formatDateTime } from "@/modules/shared/datetime";
import { StatusBadge } from "@/modules/shared/components/Badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  BAD_INPUT: "Invalid input",
  UNKNOWN_USER: "Unknown email",
  INACTIVE: "Account deactivated",
  BAD_CREDENTIALS: "Wrong password",
};

const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: "Staff account created",
  USER_UPDATED: "Staff details / role / activation changed",
  USER_PASSWORD_RESET: "Temporary password issued",
  USER_PASSWORD_CHANGED: "Password changed by staff",
  USER_PERMISSIONS_UPDATED: "Permissions changed",
  SETTINGS_UPDATED: "Hospital settings updated",
  UPI_QR_UPDATED: "UPI QR image replaced",
};

const ACCOUNT_ACTIONS = Object.keys(ACTION_LABELS);

export default async function AuditPage() {
  await requirePagePermission("audit.view");

  const [logins, accountAudits] = await Promise.all([
    prisma.loginEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, role: true } } },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ACCOUNT_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const failed = logins.filter((event) => !event.success).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            aria-label="Back to users and settings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-navy hover:bg-page"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-navy">Login activity &amp; audit log</h2>
            <p className="text-xs text-muted-foreground">
              Latest 100 sign-in attempts and 100 account/permission changes
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-md bg-page px-3 py-1.5 text-muted-foreground">
            {logins.length} sign-ins shown
          </span>
          <span className="rounded-md bg-danger-bg px-3 py-1.5 text-danger">
            {failed} failed
          </span>
        </div>
      </div>

      <section className="card">
        <div className="card-header flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-medical" aria-hidden />
          <div>
            <h3 className="card-title">Login activity</h3>
            <p className="card-subtitle">
              Passwords are never recorded — only the email tried, the outcome and the device address.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Email used</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No sign-in attempts recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                logins.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-navy">
                      {event.user?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.email}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={event.success ? "Success" : "Failed"}
                        tone={event.success ? "success" : "danger"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.success
                        ? "Signed in"
                        : (REASON_LABELS[event.reason ?? ""] ?? event.reason ?? "—")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="card">
        <div className="card-header flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-medical" aria-hidden />
          <div>
            <h3 className="card-title">Account &amp; permission audit log</h3>
            <p className="card-subtitle">
              Who created accounts, changed roles, issued temporary passwords or edited permissions.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Performed by</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountAudits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No account changes recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                accountAudits.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-navy">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.user?.name ?? "System"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.entity}
                      {entry.entityId ? ` · ${entry.entityId}` : ""}
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
