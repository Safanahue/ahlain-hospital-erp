import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import { landingPathForRole, safeInternalPath } from "@/modules/auth/landing";

type AuthorizedArgs = Parameters<NonNullable<typeof authConfig.callbacks.authorized>>[0];

function authorized(path: string, user: null | { id: string; mustChangePassword?: boolean }) {
  const request = {
    nextUrl: new URL(`http://192.168.1.10:3000${path}`),
  };
  return (authConfig.callbacks.authorized as unknown as (args: AuthorizedArgs) => unknown)({
    auth: user ? { user } : null,
    request,
  } as unknown as AuthorizedArgs);
}

describe("Phase 2 — production auth configuration", () => {
  it("trusts the LAN host so next start does not reject sign-in", () => {
    expect(authConfig.trustHost).toBe(true);
  });

  it("lets a signed-out visitor open the login and password-help pages", () => {
    expect(authorized("/login", null)).toBe(true);
    expect(authorized("/forgot-password", null)).toBe(true);
  });

  it("still redirects signed-out visitors away from hospital pages", () => {
    const response = authorized("/patients", null);
    expect(response).toBeInstanceOf(Response);
  });

  it("sends signed-in users away from the password-help page", () => {
    const response = authorized("/forgot-password", {
      id: "user-1",
      mustChangePassword: false,
    });
    expect(response).toBeInstanceOf(Response);
  });

  it("forces a temporary-password user to the change-password screen", () => {
    const response = authorized("/patients", {
      id: "user-1",
      mustChangePassword: true,
    });
    expect(response).toBeInstanceOf(Response);
  });
});

describe("Phase 2 — role-based landing pages", () => {
  it("gives every role a safe internal destination", () => {
    const roles = [
      "ADMIN",
      "BILLING_STAFF",
      "ACCOUNTS",
      "DOCTOR",
      "RECEPTION",
      "NURSE",
      "LAB_TECHNICIAN",
      "PHARMACIST",
    ] as const;

    for (const role of roles) {
      const path = landingPathForRole(role);
      expect(path.startsWith("/")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
    }
  });

  it("routes clinical and department roles to their module", () => {
    expect(landingPathForRole("LAB_TECHNICIAN")).toBe("/laboratory");
    expect(landingPathForRole("PHARMACIST")).toBe("/pharmacy");
    expect(landingPathForRole("DOCTOR")).toBe("/op");
    expect(landingPathForRole("ADMIN")).toBe("/");
  });

  it("rejects external or protocol-relative redirect targets", () => {
    expect(safeInternalPath("https://evil.example")).toBeNull();
    expect(safeInternalPath("//evil.example")).toBeNull();
    expect(safeInternalPath("/patients")).toBe("/patients");
    expect(safeInternalPath(null)).toBeNull();
  });
});
