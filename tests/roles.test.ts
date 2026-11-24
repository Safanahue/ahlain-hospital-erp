import { describe, expect, it } from "vitest";
import { authorize } from "@/modules/auth/authorize";
import {
  BILLING_VIEW_ROLES,
  PAYMENT_ROLES,
  RECONCILE_ROLES,
  SETTINGS_ROLES,
} from "@/modules/auth/roles";

const admin = { role: "ADMIN" as const, active: true };
const billingStaff = { role: "BILLING_STAFF" as const, active: true };
const accounts = { role: "ACCOUNTS" as const, active: true };
const doctor = { role: "DOCTOR" as const, active: true };

describe("authorize — role checks are enforced on the server", () => {
  it("rejects missing sessions with 401", () => {
    const result = authorize(null, PAYMENT_ROLES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("rejects deactivated accounts with 401", () => {
    const result = authorize({ role: "BILLING_STAFF", active: false }, PAYMENT_ROLES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("lets Billing Staff collect payments", () => {
    expect(authorize(billingStaff, PAYMENT_ROLES).ok).toBe(true);
  });

  it("blocks Billing Staff from reconciliation", () => {
    const result = authorize(billingStaff, RECONCILE_ROLES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("blocks Billing Staff from Users & Settings", () => {
    const result = authorize(billingStaff, SETTINGS_ROLES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("lets Accounts reconcile but not manage settings", () => {
    expect(authorize(accounts, RECONCILE_ROLES).ok).toBe(true);
    expect(authorize(accounts, SETTINGS_ROLES).ok).toBe(false);
  });

  it("gives Admin every capability", () => {
    expect(authorize(admin, PAYMENT_ROLES).ok).toBe(true);
    expect(authorize(admin, RECONCILE_ROLES).ok).toBe(true);
    expect(authorize(admin, SETTINGS_ROLES).ok).toBe(true);
  });

  it("keeps Doctor read-only: can view billing, cannot collect payments", () => {
    expect(authorize(doctor, BILLING_VIEW_ROLES).ok).toBe(true);
    expect(authorize(doctor, PAYMENT_ROLES).ok).toBe(false);
    expect(authorize(doctor, RECONCILE_ROLES).ok).toBe(false);
  });
});
