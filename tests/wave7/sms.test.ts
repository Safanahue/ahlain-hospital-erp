import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultPermissionsFor } from "@/modules/auth/permissions";
import { formatINR } from "@/modules/shared/money";
import {
  normalizePhone,
  sendSms,
} from "@/modules/communication/sms";
import {
  paymentLinkMessage,
  receiptMessage,
} from "@/modules/communication/messages";

const stamp = Date.now();
const testNumber = "9876543210";
let staff: User;
const originalEnv = {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
};

function configureGateway() {
  process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.TWILIO_FROM_NUMBER = "+911140000000";
}

function clearGateway() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
}

beforeAll(async () => {
  staff = await prisma.user.create({
    data: {
      name: "SMS Staff",
      email: `wave7-sms-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("TestPass123", 4),
      role: "BILLING_STAFF",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv.TWILIO_ACCOUNT_SID === undefined) clearGateway();
  else {
    process.env.TWILIO_ACCOUNT_SID = originalEnv.TWILIO_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = originalEnv.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_FROM_NUMBER = originalEnv.TWILIO_FROM_NUMBER;
  }
});

afterAll(async () => {
  await prisma.smsMessage.deleteMany({
    where: { OR: [{ to: { contains: "9876543210" } }, { entityId: `wave7-${stamp}` }] },
  });
  await prisma.user.deleteMany({ where: { id: staff.id } });
});

describe("Phone normalisation", () => {
  it("accepts the shapes reception actually types", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("0091 9876543210")).toBe("+919876543210");
  });

  it("rejects empty, too short and absurdly long input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
  });
});

describe("Message templates", () => {
  it("renders a short receipt message with amount and balance", () => {
    const body = receiptMessage({
      hospitalName: "AHLAIN HOSPITAL",
      receiptNo: "AH-RCPT-2026-0001",
      amountPaise: 150000,
      invoiceNo: "AH-INV-2026-0009",
      outstandingPaise: 50000,
    });
    expect(body).toContain(formatINR(150000));
    expect(body).toContain("AH-RCPT-2026-0001");
    expect(body).toContain(`Balance due ${formatINR(50000)}`);
    expect(body.length).toBeLessThanOrEqual(320);
  });

  it("renders a payment reminder with the UPI id", () => {
    const body = paymentLinkMessage({
      hospitalName: "AHLAIN HOSPITAL",
      invoiceNo: "AH-INV-2026-0009",
      outstandingPaise: 125000,
      upiId: "ahlainhospital@upi",
    });
    expect(body).toContain(formatINR(125000));
    expect(body).toContain("ahlainhospital@upi");
    expect(body.length).toBeLessThanOrEqual(320);
  });
});

describe("SMS sending", () => {
  it("logs a SKIPPED row without calling the gateway when keys are absent", async () => {
    clearGateway();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({
      to: testNumber,
      body: "Test message",
      kind: "RECEIPT",
      entityId: `wave7-${stamp}`,
      userId: staff.id,
    });

    expect(result.status).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();

    const row = await prisma.smsMessage.findFirst({
      where: { entityId: `wave7-${stamp}` },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.status).toBe("SKIPPED");
    expect(row?.error).toContain("not configured");
  });

  it("sends through Twilio and stores the provider message id", async () => {
    configureGateway();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123", status: "queued" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({
      to: testNumber,
      body: "Payment received",
      kind: "PAYMENT_LINK",
      entityId: `wave7-${stamp}`,
      userId: staff.id,
    });

    expect(result.status).toBe("SENT");
    expect(result.to).toBe("+919876543210");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/Accounts/AC_test_sid/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const sentBody = String(init.body);
    expect(sentBody).toContain("To=%2B919876543210");
    expect(sentBody).toContain("Payment+received");

    const row = await prisma.smsMessage.findFirst({
      where: { providerMessageId: "SM123" },
    });
    expect(row?.status).toBe("SENT");
    expect(row?.sentById).toBe(staff.id);
    expect(row?.to).toBe("+919876543210");
  });

  it("records a FAILED row with the gateway message on rejection", async () => {
    configureGateway();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 21610,
            message: "Attempt to send to unsubscribed recipient",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await sendSms({
      to: testNumber,
      body: "Reminder",
      kind: "PAYMENT_LINK",
      entityId: `wave7-${stamp}`,
      userId: staff.id,
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("unsubscribed");

    const row = await prisma.smsMessage.findFirst({
      where: { entityId: `wave7-${stamp}`, status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.error).toContain("unsubscribed");
  });

  it("records a FAILED row when the network request throws", async () => {
    configureGateway();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT")));

    const result = await sendSms({
      to: testNumber,
      body: "Reminder",
      kind: "RECEIPT",
      entityId: `wave7-${stamp}`,
      userId: staff.id,
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("ETIMEDOUT");
  });

  it("skips unusable phone numbers before touching the gateway", async () => {
    configureGateway();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({
      to: "12",
      body: "Reminder",
      kind: "RECEIPT",
      entityId: `wave7-${stamp}`,
      userId: staff.id,
    });

    expect(result.status).toBe("SKIPPED");
    expect(result.to).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only lets payment-capable roles send SMS", () => {
    expect(defaultPermissionsFor("BILLING_STAFF").has("billing.collect")).toBe(true);
    expect(defaultPermissionsFor("ADMIN").has("billing.collect")).toBe(true);
    expect(defaultPermissionsFor("RECEPTION").has("billing.collect")).toBe(false);
    expect(defaultPermissionsFor("NURSE").has("billing.collect")).toBe(false);
  });
});
