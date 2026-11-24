import type { Role } from "@prisma/client";

/**
 * Phase 2 — the permission catalogue.
 *
 * Roles stay as convenient templates; a user's effective access is
 * role defaults plus optional per-user allow/deny overrides stored in
 * UserPermission. Both the sidebar and every API guard resolve through this
 * file, so hiding a module and blocking its API can never disagree.
 */
export const PERMISSION_CATALOG = {
  "patients.view": {
    label: "View patient records",
    group: "Patients",
    description: "Open the patient directory, profiles and search.",
  },
  "patients.manage": {
    label: "Register & edit patients",
    group: "Patients",
    description: "Create and change patient demographics.",
  },
  "op.access": {
    label: "OP management",
    group: "Patient Care",
    description: "OP registration, consultation and queue.",
  },
  "ip.access": {
    label: "IP management",
    group: "Patient Care",
    description: "Admissions, beds, transfers, nursing and progress notes.",
  },
  "ip.discharge": {
    label: "Discharge & IP billing",
    group: "Patient Care",
    description: "Discharge summaries and the IP discharge invoice.",
  },
  "appointments.access": {
    label: "Appointments & queue",
    group: "Patient Care",
    description: "Book, check in and manage appointment slots.",
  },
  "billing.view": {
    label: "View invoices & receipts",
    group: "Finance",
    description: "See invoices, payment history and receipts.",
  },
  "billing.create": {
    label: "Create invoices",
    group: "Finance",
    description: "Raise new OP/IP/lab/pharmacy/dental invoices.",
  },
  "billing.collect": {
    label: "Collect payments",
    group: "Finance",
    description: "Record payments and print receipts.",
  },
  "billing.reconcile": {
    label: "Reconcile payments",
    group: "Finance",
    description: "Verify UPI/bank payments against the hospital account.",
  },
  "lab.access": {
    label: "Laboratory orders & reports",
    group: "Laboratory",
    description: "Order tests, collect samples, view and print reports.",
  },
  "lab.results": {
    label: "Enter lab results",
    group: "Laboratory",
    description: "Enter and verify structured test results.",
  },
  "lab.masters": {
    label: "Lab masters (presets & ranges)",
    group: "Laboratory",
    description: "Maintain report presets and reference range libraries.",
  },
  "pharmacy.access": {
    label: "Pharmacy & stock",
    group: "Pharmacy",
    description: "Medicine catalogue, stock, prescriptions and dispensing.",
  },
  "dental.access": {
    label: "Dental",
    group: "Dental",
    description: "Dental encounters, procedures and charting.",
  },
  "services.view": {
    label: "View service catalogue",
    group: "Administration",
    description: "See the hospital price list.",
  },
  "services.manage": {
    label: "Manage service catalogue",
    group: "Administration",
    description: "Create, edit and deactivate billable services.",
  },
  "reports.view": {
    label: "Reports & financial summaries",
    group: "Administration",
    description: "Collection, refund and financial reports (when built).",
  },
  "audit.view": {
    label: "Audit logs",
    group: "Administration",
    description: "Review account, billing and clinical audit entries.",
  },
  "users.manage": {
    label: "Staff & permissions",
    group: "Administration",
    description: "Create staff accounts, reset passwords, change permissions.",
  },
  "settings.manage": {
    label: "Hospital settings",
    group: "Administration",
    description: "Hospital profile, UPI QR and document branding settings.",
  },
} as const;

export type PermissionKey = keyof typeof PERMISSION_CATALOG;

export const PERMISSION_KEYS = Object.keys(PERMISSION_CATALOG) as PermissionKey[];

export const PERMISSION_GROUPS = [
  "Patients",
  "Patient Care",
  "Finance",
  "Laboratory",
  "Pharmacy",
  "Dental",
  "Administration",
] as const;

/**
 * Role templates. These reproduce the hospital's agreed matrix:
 * Admins get everything; clinical roles read patients but only manage their
 * own module; finance roles never see clinical write actions.
 */
export const ROLE_PERMISSION_DEFAULTS: Record<Role, PermissionKey[]> = {
  ADMIN: [...PERMISSION_KEYS],
  RECEPTION: [
    "patients.view",
    "patients.manage",
    "op.access",
    "appointments.access",
    "billing.view",
    "billing.create",
    "billing.collect",
    "dental.access",
    "services.view",
  ],
  BILLING_STAFF: [
    "patients.view",
    "op.access",
    "appointments.access",
    "billing.view",
    "billing.create",
    "billing.collect",
    "services.view",
  ],
  ACCOUNTS: ["billing.view", "billing.reconcile", "reports.view"],
  DOCTOR: [
    "patients.view",
    "op.access",
    "ip.access",
    "ip.discharge",
    "appointments.access",
    "billing.view",
    "lab.access",
    "lab.results",
    "dental.access",
    "services.view",
  ],
  NURSE: ["patients.view", "ip.access", "op.access"],
  LAB_TECHNICIAN: ["patients.view", "lab.access", "lab.results", "lab.masters"],
  PHARMACIST: ["patients.view", "pharmacy.access"],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, value);
}

/** Role defaults as a Set (used everywhere permission checks happen). */
export function defaultPermissionsFor(role: Role): Set<PermissionKey> {
  return new Set(ROLE_PERMISSION_DEFAULTS[role] ?? []);
}

/**
 * Applies explicit per-user overrides on top of the role defaults.
 * `allowed: true` grants an extra permission, `allowed: false` removes one.
 */
export function resolvePermissions(
  role: Role,
  overrides: { permission: string; allowed: boolean }[],
): Set<PermissionKey> {
  const effective = defaultPermissionsFor(role);

  for (const override of overrides) {
    if (!isPermissionKey(override.permission)) continue;
    if (override.allowed) effective.add(override.permission);
    else effective.delete(override.permission);
  }

  return effective;
}
