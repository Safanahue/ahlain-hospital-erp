import type { Role } from "@prisma/client";

/**
 * Everyone in scope can view billing data (Doctor is read-only; Reception gets
 * basic invoice/receipt access for reprinting receipts at the front desk).
 */
export const BILLING_VIEW_ROLES: Role[] = [
  "ADMIN",
  "BILLING_STAFF",
  "ACCOUNTS",
  "DOCTOR",
  "RECEPTION",
];

/** Billing Staff + Accounts + Admin: create invoices, collect payments, print receipts. */
export const PAYMENT_ROLES: Role[] = ["ADMIN", "BILLING_STAFF", "ACCOUNTS"];

/** Accounts + Admin: reconcile payments and view reports. */
export const RECONCILE_ROLES: Role[] = ["ADMIN", "ACCOUNTS"];

/** Admin only: Users & Settings. */
export const SETTINGS_ROLES: Role[] = ["ADMIN"];

/**
 * Wave 0 — Service Catalog (master data).
 * Everyone who prices or books services can read the price list; only Admin
 * and Billing Staff maintain it (it drives InvoiceItem pricing).
 */
export const SERVICE_VIEW_ROLES: Role[] = [
  "ADMIN",
  "BILLING_STAFF",
  "ACCOUNTS",
  "DOCTOR",
  "RECEPTION",
];

/** Wave 0 — Service Catalog: create / update / activate / deactivate. */
export const SERVICE_MANAGE_ROLES: Role[] = ["ADMIN", "BILLING_STAFF"];

/**
 * Wave 1 — Patients 360. Every role that treats, books, bills or dispenses to
 * a patient may view the directory; registration/editing stays with Reception.
 */
export const PATIENT_VIEW_ROLES: Role[] = [
  "ADMIN",
  "BILLING_STAFF",
  "ACCOUNTS",
  "DOCTOR",
  "RECEPTION",
  "NURSE",
  "LAB_TECHNICIAN",
  "PHARMACIST",
];

/**
 * Phase 2 ownership groups — permission structure ONLY.
 * The screens these roles will own (Patients, Appointments, OP, Lab, Pharmacy,
 * IP) are built in later waves; nothing outside tests references them yet, so
 * the new roles can safely own their modules when those modules arrive.
 */
/** Patient registration & search (Wave 1: /patients create & edit). */
export const REGISTRATION_ROLES: Role[] = ["ADMIN", "RECEPTION"];
/** Appointments, queue and check-in (Wave 1). */
export const APPOINTMENT_ROLES: Role[] = ["ADMIN", "RECEPTION", "DOCTOR"];
/** Dental encounters, procedure logging, charting. */
export const DENTAL_ROLES: Role[] = ["ADMIN", "DOCTOR", "RECEPTION"];
/** Check that an actor has book/appointment permission. */
export function assertCanBook(actor: { role: Role; active: boolean }): { ok: boolean; status: number; message: string } {
  if (actor.role === "DOCTOR" && !actor.active) return { ok: false, status: 403, message: "Inactive doctors cannot book appointments" };
  if (!APPOINTMENT_ROLES.includes(actor.role)) return { ok: false, status: 403, message: "Only admin, reception, or doctors can book appointments" };
  return { ok: true, status: 200, message: "OK" };
}
/** OP visit records and clinical workflow (Wave 1). */
export const OP_VISIT_ROLES: Role[] = ["ADMIN", "DOCTOR", "NURSE", "RECEPTION"];
/** Lab orders and result entry (Wave 2). */
export const LAB_ORDER_ROLES: Role[] = ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"];
/** Laboratory reference ranges: Admin, the lab in-charge (Lab Technician) and Doctors maintain the library. */
export const LAB_REF_RANGE_VIEW_ROLES: Role[] = ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"];
export const LAB_REF_RANGE_MANAGE_ROLES: Role[] = ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"];
/** Lab report presets (CBC/LFT templates): lab staff, doctors and admins maintain them. */
export const LAB_PRESET_VIEW_ROLES: Role[] = ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"];
export const LAB_PRESET_MANAGE_ROLES: Role[] = ["ADMIN", "DOCTOR", "LAB_TECHNICIAN"];
/** Medicine/stock and dispensing workflow (Wave 2). */
export const PHARMACY_ROLES: Role[] = ["ADMIN", "PHARMACIST", "DOCTOR", "BILLING_STAFF"];
/** IP admission + nursing workflow (Wave 2). */
export const IP_WORK_ROLES: Role[] = ["ADMIN", "DOCTOR", "NURSE", "RECEPTION", "BILLING_STAFF"];
/** Bed master data (wards, rooms, tariffs): front desk and admin maintain it. */
export const IP_BED_MANAGE_ROLES: Role[] = ["ADMIN", "RECEPTION"];
/** Discharge documentation & billing: clinical + billing roles only. */
export const IP_DISCHARGE_ROLES: Role[] = ["ADMIN", "DOCTOR", "BILLING_STAFF"];

export const PRIMARY_HOSPITAL_ROLES: Role[] = ["ADMIN", "DOCTOR", "RECEPTION"];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  DOCTOR: "Doctor",
  RECEPTION: "Receptionist",
  // Legacy labels kept for backward compatibility with existing records
  BILLING_STAFF: "Billing Staff (Legacy)",
  ACCOUNTS: "Accounts (Legacy)",
  NURSE: "Nurse (Legacy)",
  LAB_TECHNICIAN: "Lab Technician",
  PHARMACIST: "Pharmacist",
};

/**
 * Roles an administrator can assign when creating or editing a staff account.
 * Pharmacy and Laboratory staff must be created with their own role — a
 * Reception account cannot be given those module permissions by role.
 */
export const STAFF_ROLE_OPTIONS: {
  value: Role;
  label: string;
  description: string;
}[] = [
  {
    value: "ADMIN",
    label: "Administrator — Full access & settings",
    description: "Every module, staff accounts, permissions and hospital settings.",
  },
  {
    value: "DOCTOR",
    label: "Doctor — OPD/IPD care, prescriptions & labs",
    description: "Patient records, consultations, lab orders and dental care.",
  },
  {
    value: "RECEPTION",
    label: "Receptionist — Registrations, appointments & billing",
    description: "Patient registration, appointments, OP visits and front-desk billing.",
  },
  {
    value: "PHARMACIST",
    label: "Pharmacist — Pharmacy, stock & dispensing",
    description: "Pharmacy module, medicine stock, prescriptions and dispensing.",
  },
  {
    value: "LAB_TECHNICIAN",
    label: "Lab Technician — Lab orders, results & reports",
    description: "Laboratory orders, result entry, report presets and reference ranges.",
  },
];
