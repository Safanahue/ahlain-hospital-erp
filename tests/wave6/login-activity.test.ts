import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  clientAddress,
  recordLoginAttempt,
} from "@/modules/auth/login-events";
import { defaultPermissionsFor } from "@/modules/auth/permissions";

const stamp = Date.now();
let staff: User;
let inactive: User;

beforeAll(async () => {
  const hash = bcrypt.hashSync("TestPass123", 4);
  staff = await prisma.user.create({
    data: {
      name: "Login Staff",
      email: `wave6-staff-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "NURSE",
    },
  });
  inactive = await prisma.user.create({
    data: {
      name: "Login Inactive",
      email: `wave6-inactive-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "NURSE",
      active: false,
    },
  });
});

afterAll(async () => {
  await prisma.loginEvent.deleteMany({
    where: { email: { contains: `wave6-` } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [staff.id, inactive.id] } } });
});

describe("Login activity recording", () => {
  it("stores a successful sign-in, stamps lastLoginAt and never stores secrets", async () => {
    const before = staff.lastLoginAt;
    expect(before).toBeNull();

    await recordLoginAttempt({
      email: `  WAVE6-Staff-${stamp}@ahlain.test `,
      userId: staff.id,
      success: true,
      ipAddress: "192.168.1.20",
      userAgent: "Mozilla/5.0 test",
    });

    const events = await prisma.loginEvent.findMany({
      where: { email: `wave6-staff-${stamp}@ahlain.test` },
    });
    expect(events).toHaveLength(1);
    expect(events[0].success).toBe(true);
    expect(events[0].userId).toBe(staff.id);
    expect(events[0].reason).toBeNull();
    expect(events[0].ipAddress).toBe("192.168.1.20");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it("records a failed attempt with its reason and leaves lastLoginAt alone", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });

    await recordLoginAttempt({
      email: `wave6-staff-${stamp}@ahlain.test`,
      userId: staff.id,
      success: false,
      reason: "BAD_CREDENTIALS",
      ipAddress: "192.168.1.21",
    });

    const failed = await prisma.loginEvent.findFirst({
      where: {
        email: `wave6-staff-${stamp}@ahlain.test`,
        success: false,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(failed?.reason).toBe("BAD_CREDENTIALS");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.lastLoginAt).toEqual(before.lastLoginAt);
  });

  it("records attempts for unknown and deactivated accounts without a user link", async () => {
    await recordLoginAttempt({
      email: `nobody-${stamp}@ahlain.test`,
      success: false,
      reason: "UNKNOWN_USER",
    });
    await recordLoginAttempt({
      email: `wave6-inactive-${stamp}@ahlain.test`,
      userId: inactive.id,
      success: false,
      reason: "INACTIVE",
    });

    const unknown = await prisma.loginEvent.findFirst({
      where: { email: `nobody-${stamp}@ahlain.test` },
    });
    expect(unknown?.userId).toBeNull();
    expect(unknown?.reason).toBe("UNKNOWN_USER");

    const blocked = await prisma.loginEvent.findFirst({
      where: { email: `wave6-inactive-${stamp}@ahlain.test` },
    });
    expect(blocked?.reason).toBe("INACTIVE");
    expect(blocked?.userId).toBe(inactive.id);

    const inactiveAfter = await prisma.user.findUniqueOrThrow({
      where: { id: inactive.id },
    });
    expect(inactiveAfter.lastLoginAt).toBeNull();
  });

  it("clips oversized headers so a hostile request cannot bloat the table", async () => {
    const longAgent = "x".repeat(5000);
    await recordLoginAttempt({
      email: `wave6-staff-${stamp}@ahlain.test`,
      success: false,
      reason: "BAD_INPUT",
      userAgent: longAgent,
    });
    const event = await prisma.loginEvent.findFirst({
      where: { email: `wave6-staff-${stamp}@ahlain.test`, reason: "BAD_INPUT" },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.userAgent?.length).toBe(300);
  });
});

describe("Client address extraction", () => {
  it("prefers the first forwarded address", () => {
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.5, 172.16.0.1",
      "x-real-ip": "172.16.0.1",
    });
    expect(clientAddress(headers)).toBe("10.0.0.5");
  });

  it("falls back to x-real-ip and then nothing", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "10.0.0.9" }))).toBe("10.0.0.9");
    expect(clientAddress(new Headers())).toBeNull();
    expect(clientAddress(undefined)).toBeNull();
  });
});

describe("Audit screen access", () => {
  it("restricts login activity and audit views to Admin by default", () => {
    expect(defaultPermissionsFor("ADMIN").has("audit.view")).toBe(true);
    for (const role of [
      "RECEPTION",
      "BILLING_STAFF",
      "ACCOUNTS",
      "DOCTOR",
      "NURSE",
      "LAB_TECHNICIAN",
      "PHARMACIST",
    ] as const) {
      expect(defaultPermissionsFor(role).has("audit.view")).toBe(false);
    }
  });
});
