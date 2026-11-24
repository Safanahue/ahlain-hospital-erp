import {
  BarChart3,
  BedDouble,
  CalendarDays,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Receipt,
  Settings,
  ShieldCheck,
  Smile,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/modules/auth/permissions";

export type NavChild = {
  label: string;
  href: string;
  permission?: PermissionKey;
};

/** Logical sidebar sections (rendered as labelled groups). */
export type NavGroup =
  | "Main"
  | "Patient Care"
  | "Departments"
  | "Finance"
  | "Communication"
  | "Administration";

export const NAV_GROUP_ORDER: NavGroup[] = [
  "Main",
  "Patient Care",
  "Departments",
  "Finance",
  "Communication",
  "Administration",
];

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  /** "soon" items render as disabled placeholders (Phase 1 shows them, but they are not built yet). */
  status: "ready" | "soon";
  /** Module permission required to see this item (omit for everyone). */
  permission?: PermissionKey;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    group: "Main",
    status: "ready",
  },
  {
    label: "Patients",
    href: "/patients",
    icon: Users,
    group: "Patient Care",
    status: "ready",
    permission: "patients.view",
  },
  {
    label: "OP Management",
    href: "/op",
    icon: Stethoscope,
    group: "Patient Care",
    status: "ready",
    permission: "op.access",
  },
  {
    label: "IP Management",
    href: "/ip",
    icon: BedDouble,
    group: "Patient Care",
    status: "ready",
    permission: "ip.access",
    children: [
      { label: "Inpatients", href: "/ip", permission: "ip.access" },
      { label: "Bed Management", href: "/ip/beds", permission: "ip.access" },
    ],
  },
  {
    label: "Appointments & Queue",
    href: "/appointments",
    icon: CalendarDays,
    group: "Patient Care",
    status: "ready",
    permission: "appointments.access",
  },
  {
    label: "Laboratory",
    href: "/laboratory",
    icon: FlaskConical,
    group: "Departments",
    status: "ready",
    permission: "lab.access",
    children: [
      { label: "Lab Orders", href: "/laboratory", permission: "lab.access" },
      { label: "Report Presets", href: "/laboratory/presets", permission: "lab.masters" },
    ],
  },
  {
    label: "Pharmacy & Stock",
    href: "/pharmacy",
    icon: Pill,
    group: "Departments",
    status: "ready",
    permission: "pharmacy.access",
  },
  {
    label: "Dental",
    href: "/dental",
    icon: Smile,
    group: "Departments",
    status: "ready",
    permission: "dental.access",
  },
  {
    label: "Billing & Payments",
    href: "/billing/invoices",
    icon: Receipt,
    group: "Finance",
    status: "ready",
    permission: "billing.view",
    children: [
      { label: "Invoices", href: "/billing/invoices", permission: "billing.view" },
      {
        label: "Reconciliation",
        href: "/billing/reconciliation",
        permission: "billing.reconcile",
      },
    ],
  },
  {
    label: "Insurance / TPA",
    href: "/insurance",
    icon: ShieldCheck,
    group: "Finance",
    status: "soon",
  },
  {
    label: "Communication & SMS",
    href: "/communication",
    icon: MessageSquare,
    group: "Communication",
    status: "ready",
    permission: "settings.manage",
    children: [
      { label: "SMS Logs", href: "/communication", permission: "settings.manage" },
      { label: "Live Testing", href: "/communication/test", permission: "settings.manage" },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    group: "Administration",
    status: "soon",
    permission: "reports.view",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    group: "Administration",
    status: "ready",
    permission: "settings.manage",
    children: [
      { label: "Hospital & Users", href: "/settings", permission: "settings.manage" },
      { label: "Service Catalog", href: "/settings/services", permission: "services.view" },
      { label: "Audit Logs", href: "/settings/audit", permission: "audit.view" },
    ],
  },
];

export type Crumb = { label: string; href?: string };
export type PageMeta = { title: string; breadcrumbs: Crumb[] };

/** Resolves the header title + breadcrumb for a pathname. */
export function getPageMeta(pathname: string): PageMeta {
  const matchingItems = NAV_ITEMS.filter(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/")
  ).sort((a, b) => b.href.length - a.href.length);

  const item = matchingItems[0];
  if (!item) return { title: "Dashboard", breadcrumbs: [{ label: "Dashboard", href: "/" }] };

  const base: Crumb[] = [{ label: item.label, href: item.href }];

  const child = item.children
    ?.slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

  if (child) {
    const crumbs = [...base, { label: child.label, href: child.href }];
    if (pathname.startsWith("/billing/invoices/")) {
      const parts = pathname.split("/");
      const tail = parts[4];
      if (tail === "payment") {
        crumbs.push({ label: "Collect payment" });
        return { title: "Collect payment", breadcrumbs: crumbs };
      }
      crumbs.push({ label: "Invoice detail" });
      return { title: "Invoice detail", breadcrumbs: crumbs };
    }
    if (pathname.startsWith("/billing/receipts/")) {
      crumbs.push({ label: "Payment receipt" });
      return { title: "Payment receipt", breadcrumbs: crumbs };
    }
    return { title: child.label, breadcrumbs: crumbs };
  }

  if (pathname.startsWith("/billing/receipts/")) {
    base.push({ label: "Payment receipt" });
    return { title: "Payment receipt", breadcrumbs: base };
  }

  // Patient sub-pages (Wave 1)
  if (pathname === "/patients/new") {
    base.push({ label: "New patient" });
    return { title: "New patient", breadcrumbs: base };
  }
  if (/^\/patients\/[^/]+\/edit$/.test(pathname)) {
    base.push({ label: "Edit patient" });
    return { title: "Edit patient", breadcrumbs: base };
  }
  if (/^\/patients\/[^/]+$/.test(pathname)) {
    base.push({ label: "Patient details" });
    return { title: "Patient details", breadcrumbs: base };
  }

  return { title: item.label, breadcrumbs: base };
}
