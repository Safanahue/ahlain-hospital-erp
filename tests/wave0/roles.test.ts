import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { authorize } from "@/modules/auth/authorize";
import {
  APPOINTMENT_ROLES,
  BILLING_VIEW_ROLES,
  IP_WORK_ROLES,
  LAB_ORDER_ROLES,
  OP_VISIT_ROLES,
  PAYMENT_ROLES,
  PHARMACY_ROLES,
  REGISTRATION_ROLES,
  ROLE_LABELS,
  SERVICE_MANAGE_ROLES,
  SERVICE_VIEW_ROLES,
  SETTINGS_ROLES,
} from "@/modules/auth/roles";

const EXISTING_ROLES = ["ADMIN", "BILLING_STAFF", "ACCOUNTS", "DOCTOR"];
const NEW_ROLES = ["RECEPTION", "NURSE", "LAB_TECHNICIAN", "PHARMACIST"];
const ALL_ROLES = [...EXISTING_ROLES, ...NEW_ROLES] as const;

describe("Wave 0 — role expansion", () => {
  it("adds the four new roles without renaming or removing existing ones", () => {
    const values = Object.values(Role);
    for (const role of ALL_ROLES) expect(values).toContain(role);
    expect(values).toHaveLength(8);
    for (const role of EXISTING_ROLES) expect(values).toContain(role);
  });

  it("labels every role for the UI", () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("lets Reception view billing/receipts but not collect payments or manage settings", () => {
    const reception = { role: "RECEPTION" as const, active: true };
    expect(authorize(reception, BILLING_VIEW_ROLES).ok).toBe(true);
    expect(authorize(reception, SERVICE_VIEW_ROLES).ok).toBe(true);
    expect(authorize(reception, PAYMENT_ROLES).ok).toBe(false);
    expect(authorize(reception, SETTINGS_ROLES).ok).toBe(false);
    expect(authorize(reception, SERVICE_MANAGE_ROLES).ok).toBe(false);
  });

  it("keeps Nurse, Lab Technician and Pharmacist away from billing, settings and the catalog", () => {
    for (const role of ["NURSE", "LAB_TECHNICIAN", "PHARMACIST"] as const) {
      const subject = { role, active: true };
      expect(authorize(subject, BILLING_VIEW_ROLES).ok).toBe(false);
      expect(authorize(subject, SETTINGS_ROLES).ok).toBe(false);
      expect(authorize(subject, SERVICE_VIEW_ROLES).ok).toBe(false);
      expect(authorize(subject, SERVICE_MANAGE_ROLES).ok).toBe(false);
    }
  });

  it("grants each new role its intended future-module ownership", () => {
    const lab = { role: "LAB_TECHNICIAN" as const, active: true };
    const pharmacist = { role: "PHARMACIST" as const, active: true };
    const nurse = { role: "NURSE" as const, active: true };
    const reception = { role: "RECEPTION" as const, active: true };
    const doctor = { role: "DOCTOR" as const, active: true };

    expect(authorize(lab, LAB_ORDER_ROLES).ok).toBe(true);
    expect(authorize(lab, PHARMACY_ROLES).ok).toBe(false);

    expect(authorize(pharmacist, PHARMACY_ROLES).ok).toBe(true);
    expect(authorize(pharmacist, IP_WORK_ROLES).ok).toBe(false);

    expect(authorize(nurse, IP_WORK_ROLES).ok).toBe(true);
    expect(authorize(nurse, REGISTRATION_ROLES).ok).toBe(false);

    expect(authorize(reception, REGISTRATION_ROLES).ok).toBe(true);
    expect(authorize(reception, APPOINTMENT_ROLES).ok).toBe(true);
    expect(authorize(reception, OP_VISIT_ROLES).ok).toBe(true);

    expect(authorize(doctor, OP_VISIT_ROLES).ok).toBe(true);
    expect(authorize(doctor, LAB_ORDER_ROLES).ok).toBe(true);
    expect(authorize(doctor, SERVICE_MANAGE_ROLES).ok).toBe(false);
  });

  it("gives Admin access to every permission group", () => {
    const admin = { role: "ADMIN" as const, active: true };
    const groups = [
      BILLING_VIEW_ROLES,
      PAYMENT_ROLES,
      SETTINGS_ROLES,
      SERVICE_VIEW_ROLES,
      SERVICE_MANAGE_ROLES,
      REGISTRATION_ROLES,
      APPOINTMENT_ROLES,
      OP_VISIT_ROLES,
      LAB_ORDER_ROLES,
      PHARMACY_ROLES,
      IP_WORK_ROLES,
    ];
    for (const group of groups) {
      expect(authorize(admin, group).ok).toBe(true);
    }
  });

  it("rejects deactivated new-role accounts with 401", () => {
    const result = authorize(
      { role: "RECEPTION", active: false },
      SERVICE_VIEW_ROLES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("blocks a new role from a protected group with 403", () => {
    const result = authorize(
      { role: "PHARMACIST", active: true },
      SERVICE_MANAGE_ROLES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
