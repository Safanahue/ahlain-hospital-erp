import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Patient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPayment, reconcilePayment } from "@/modules/billing/service";
import { ApiError } from "@/modules/shared/api";

const stamp = Date.now();

let billingUser: User;
let accountsUser: User;
let patient: Patient;

beforeAll(async () => {
  billingUser = await prisma.user.create({
    data: {
      name: "Test Billing",
      email: `billing-test-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "BILLING_STAFF",
    },
  });
  accountsUser = await prisma.user.create({
    data: {
      name: "Test Accounts",
      email: `accounts-test-${stamp}@ahlain.test`,
      passwordHash: bcrypt.hashSync("test-password", 4),
      role: "ACCOUNTS",
    },
  });
  patient = await prisma.patient.create({
    data: {
      uhid: `AH-T-${stamp}`,
      name: "Test Patient",
      phone: "9000000000",
      age: 30,
      gender: "OTHER",
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: [billingUser.id, accountsUser.id] } } });
  await prisma.payment.deleteMany({ where: { invoice: { createdBy: billingUser.id } } });
  await prisma.invoice.deleteMany({ where: { createdBy: billingUser.id } });
  await prisma.patient.deleteMany({ where: { id: patient.id } });
  await prisma.user.deleteMany({ where: { id: { in: [billingUser.id, accountsUser.id] } } });
  await prisma.$disconnect();
});

let invoiceCounter = 0;
async function makeInvoice(totalRupees: number) {
  invoiceCounter += 1;
  const totalAmount = totalRupees * 100;
  return prisma.invoice.create({
    data: {
      invoiceNo: `INV-TEST-${stamp}-${invoiceCounter}`,
      patientId: patient.id,
      department: "OP",
      billType: "GENERAL",
      status: "UNPAID",
      totalAmount,
      paidAmount: 0,
      createdBy: billingUser.id,
      items: {
        create: [
          {
            category: "SERVICE_CHARGES",
            description: "Integration test charge",
            amount: totalAmount,
          },
        ],
      },
    },
  });
}

const key = () => crypto.randomUUID();

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  messagePattern: RegExp,
) {
  try {
    await promise;
    throw new Error("expected the operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(status);
    expect(apiError.message).toMatch(messagePattern);
  }
}

describe("payment creation", () => {
  it("rejects payments above the outstanding balance and updates the invoice correctly", async () => {
    const invoice = await makeInvoice(8_750); // ₹8,750

    // Overpayment is rejected server-side, regardless of what the client claims.
    await expectApiError(
      createPayment(
        {
          invoiceId: invoice.id,
          amount: 9_000_000,
          method: "CASH",
          transactionRef: "",
          idempotencyKey: key(),
        },
        billingUser,
      ),
      400,
      /exceeds the outstanding balance/,
    );

    // Partial payment succeeds and moves the invoice to PARTIALLY_PAID.
    const partial = await createPayment(
      {
        invoiceId: invoice.id,
        amount: 500_000,
        method: "CASH",
        transactionRef: "",
        idempotencyKey: key(),
      },
      billingUser,
    );
    expect(partial.invoice.status).toBe("PARTIALLY_PAID");
    expect(partial.invoice.outstanding).toBe(375_000);

    // Attempting ₹4,000 now exceeds the remaining ₹3,750.
    await expectApiError(
      createPayment(
        {
          invoiceId: invoice.id,
          amount: 400_000,
          method: "CASH",
          transactionRef: "",
          idempotencyKey: key(),
        },
        billingUser,
      ),
      400,
      /exceeds the outstanding balance of ₹3,750/,
    );

    // Paying the exact remainder closes the invoice.
    const final = await createPayment(
      {
        invoiceId: invoice.id,
        amount: 375_000,
        method: "CASH",
        transactionRef: "",
        idempotencyKey: key(),
      },
      billingUser,
    );
    expect(final.invoice.status).toBe("PAID");
    expect(final.invoice.paidAmount).toBe(875_000);
    expect(final.invoice.outstanding).toBe(0);

    const fresh = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(fresh.paidAmount).toBe(875_000);
    expect(fresh.status).toBe("PAID");
  });

  it("rejects duplicate UTR references across all payments", async () => {
    const invoiceA = await makeInvoice(500);
    const invoiceB = await makeInvoice(750);
    const utr = String(stamp).padStart(12, "0").slice(-12);

    const first = await createPayment(
      {
        invoiceId: invoiceA.id,
        amount: 50_000,
        method: "UPI",
        transactionRef: utr,
        idempotencyKey: key(),
      },
      billingUser,
    );
    expect(first.payment.transactionRef).toBe(utr);

    // Same UTR on a different invoice → clear 409 error.
    await expectApiError(
      createPayment(
        {
          invoiceId: invoiceB.id,
          amount: 75_000,
          method: "UPI",
          transactionRef: utr,
          idempotencyKey: key(),
        },
        billingUser,
      ),
      409,
      /already recorded against receipt/,
    );

    // UPI references must be exactly 12 digits.
    await expect(
      createPayment(
        {
          invoiceId: invoiceB.id,
          amount: 75_000,
          method: "UPI",
          transactionRef: "12345",
          idempotencyKey: key(),
        },
        billingUser,
      ),
    ).rejects.toThrow(/12 digits/);

    const count = await prisma.payment.count({ where: { transactionRef: utr } });
    expect(count).toBe(1);
  });

  it("is idempotent: a double submit returns the original payment once", async () => {
    const invoice = await makeInvoice(1_200);
    const idempotencyKey = key();

    const input = {
      invoiceId: invoice.id,
      amount: 120_000,
      method: "UPI" as const,
      transactionRef: String(stamp + 1).padStart(12, "0").slice(-12),
      idempotencyKey,
    };

    const first = await createPayment(input, billingUser);
    const second = await createPayment(input, billingUser);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.payment.receiptNo).toBe(first.payment.receiptNo);

    const payments = await prisma.payment.findMany({
      where: { idempotencyKey },
    });
    expect(payments).toHaveLength(1);

    // The invoice was only charged once.
    const fresh = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(fresh.paidAmount).toBe(120_000);
  });

  it("requires card and bank references", async () => {
    const invoice = await makeInvoice(300);
    await expect(
      createPayment(
        {
          invoiceId: invoice.id,
          amount: 30_000,
          method: "BANK_TRANSFER",
          transactionRef: "",
          idempotencyKey: key(),
        },
        billingUser,
      ),
    ).rejects.toThrow(/reference is required/i);
  });
});

describe("reconciliation", () => {
  it("marks a UPI payment as reconciled, audit logs it, and refuses repeats", async () => {
    const invoice = await makeInvoice(2_000);
    const payment = await createPayment(
      {
        invoiceId: invoice.id,
        amount: 200_000,
        method: "UPI",
        transactionRef: String(stamp + 2).padStart(12, "0").slice(-12),
        idempotencyKey: key(),
      },
      billingUser,
    );
    expect(payment.payment.reconciliationStatus).toBe("PENDING");

    const updated = await reconcilePayment(
      payment.payment.id,
      { status: "RECONCILED", note: "Matched bank statement" },
      accountsUser,
    );
    expect(updated.reconciliationStatus).toBe("RECONCILED");

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "PAYMENT_RECONCILED",
        entityId: payment.payment.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(accountsUser.id);

    // Second attempt is rejected.
    await expectApiError(
      reconcilePayment(
        payment.payment.id,
        { status: "MISMATCH", note: "changed my mind" },
        accountsUser,
      ),
      409,
      /already marked as/,
    );
  });

  it("refuses to reconcile cash payments", async () => {
    const invoice = await makeInvoice(400);
    const payment = await createPayment(
      {
        invoiceId: invoice.id,
        amount: 40_000,
        method: "CASH",
        transactionRef: "",
        idempotencyKey: key(),
      },
      billingUser,
    );

    await expectApiError(
      reconcilePayment(
        payment.payment.id,
        { status: "RECONCILED", note: "" },
        accountsUser,
      ),
      400,
      /Only UPI and bank transfer/,
    );
  });

  it("requires a note when marking a mismatch", async () => {
    const invoice = await makeInvoice(600);
    const payment = await createPayment(
      {
        invoiceId: invoice.id,
        amount: 60_000,
        method: "UPI",
        transactionRef: String(stamp + 3).padStart(12, "0").slice(-12),
        idempotencyKey: key(),
      },
      billingUser,
    );

    await expect(
      reconcilePayment(
        payment.payment.id,
        { status: "MISMATCH", note: "" },
        accountsUser,
      ),
    ).rejects.toThrow(/note is required/i);
  });
});
