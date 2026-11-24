import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Invoice, Patient, Payment, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { defaultPermissionsFor } from "@/modules/auth/permissions";
import {
  approveRefund,
  createRefund,
  rejectRefund,
} from "@/modules/billing/refunds";
import { getInvoiceDetail } from "@/modules/billing/queries";

const stamp = Date.now();
let requester: User;
let approver: User;
let patient: Patient;
let invoice: Invoice;
let payment: Payment;
let failedPayment: Payment;

async function makePayment(data: {
  invoiceId: string;
  amount: number;
  status: "SUCCESS" | "FAILED";
  suffix: string;
}) {
  return prisma.payment.create({
    data: {
      invoiceId: data.invoiceId,
      receiptNo: `TEST-RCPT-${stamp}-${data.suffix}`,
      method: "CASH",
      amount: data.amount,
      status: data.status,
      collectedBy: requester.id,
      idempotencyKey: `wave9-${stamp}-${data.suffix}`,
    },
  });
}

beforeAll(async () => {
  const hash = bcrypt.hashSync("TestPass123", 4);
  requester = await prisma.user.create({
    data: {
      name: "Refund Requester",
      email: `wave9-request-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "BILLING_STAFF",
    },
  });
  approver = await prisma.user.create({
    data: {
      name: "Refund Approver",
      email: `wave9-approve-${stamp}@ahlain.test`,
      passwordHash: hash,
      role: "ACCOUNTS",
    },
  });
  patient = await prisma.patient.create({
    data: {
      uhid: `AH-W9-${stamp}`,
      name: "Refund Test Patient",
      age: 30,
      gender: "FEMALE",
      phone: "9876500000",
      address: "",
    },
  });
  invoice = await prisma.invoice.create({
    data: {
      invoiceNo: `INV-W9-${stamp}`,
      patientId: patient.id,
      department: "OP",
      billType: "GENERAL",
      status: "PAID",
      totalAmount: 100000,
      paidAmount: 100000,
      createdBy: requester.id,
      items: {
        create: {
          category: "SERVICE_CHARGES",
          description: "Consultation",
          amount: 100000,
        },
      },
    },
  });
  payment = await makePayment({
    invoiceId: invoice.id,
    amount: 100000,
    status: "SUCCESS",
    suffix: "paid",
  });
  failedPayment = await makePayment({
    invoiceId: invoice.id,
    amount: 1000,
    status: "FAILED",
    suffix: "failed",
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: [requester.id, approver.id] } }] },
  });
  await prisma.refund.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await prisma.patient.delete({ where: { id: patient.id } });
  await prisma.user.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
});

describe("Refund requests", () => {
  it("creates a pending refund without changing the invoice yet", async () => {
    const refund = await createRefund(
      { paymentId: payment.id, amount: 40000, reason: "Test cancelled after payment" },
      requester,
    );

    expect(refund.status).toBe("PENDING");
    expect(refund.refundNo).toMatch(/^RFD-\d{4}-\d{5}$/);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount).toBe(100000);
    expect(after.status).toBe("PAID");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "REFUND_REQUESTED", entityId: refund.id },
    });
    expect(audit?.after).toMatchObject({ amount: 40000 });
  });

  it("cannot request more than the unrefunded payment amount", async () => {
    await expect(
      createRefund(
        { paymentId: payment.id, amount: 70000, reason: "Too much" },
        requester,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects refunds on payments that did not succeed", async () => {
    await expect(
      createRefund(
        { paymentId: failedPayment.id, amount: 100, reason: "Failed payment" },
        requester,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("requires a real reason", async () => {
    await expect(
      createRefund({ paymentId: payment.id, amount: 100, reason: "x" }, requester),
    ).rejects.toThrow();
  });

  it("keeps request and approval permissions separate", () => {
    expect(defaultPermissionsFor("BILLING_STAFF").has("billing.collect")).toBe(true);
    expect(defaultPermissionsFor("BILLING_STAFF").has("billing.reconcile")).toBe(false);
    expect(defaultPermissionsFor("ACCOUNTS").has("billing.reconcile")).toBe(true);
    expect(defaultPermissionsFor("ACCOUNTS").has("billing.collect")).toBe(false);
  });
});

describe("Approval and rejection", () => {
  it("approves a refund and rebuilds the invoice balance from net paid", async () => {
    const refund = await prisma.refund.findFirstOrThrow({
      where: { invoiceId: invoice.id, status: "PENDING" },
    });

    const approved = await approveRefund(refund.id, approver);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(approver.id);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount).toBe(60000);
    expect(after.status).toBe("PARTIALLY_PAID");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "REFUND_APPROVED", entityId: refund.id },
    });
    expect(audit?.after).toMatchObject({ netPaid: 60000, invoiceStatus: "PARTIALLY_PAID" });
  });

  it("refuses to approve the same refund twice", async () => {
    const refund = await prisma.refund.findFirstOrThrow({
      where: { invoiceId: invoice.id, status: "APPROVED" },
    });
    await expect(approveRefund(refund.id, approver)).rejects.toBeInstanceOf(ApiError);
  });

  it("reports refunded, net paid and the higher outstanding balance", async () => {
    const detail = await getInvoiceDetail(invoice.id);
    expect(detail?.successPaid).toBe(100000);
    expect(detail?.refundedAmount).toBe(40000);
    expect(detail?.netPaid).toBe(60000);
    expect(detail?.outstanding).toBe(40000);
    expect(detail?.refunds).toHaveLength(1);
  });

  it("rejecting keeps the balance untouched and frees the amount again", async () => {
    const second = await createRefund(
      { paymentId: payment.id, amount: 10000, reason: "Duplicate request" },
      requester,
    );

    const rejected = await rejectRefund(second.id, { note: "Not eligible" }, approver);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionNote).toBe("Not eligible");

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount).toBe(60000);

    // The rejected amount is refundable again: 100000 − 40000 approved.
    const retry = await createRefund(
      { paymentId: payment.id, amount: 60000, reason: "Full remaining refund" },
      requester,
    );
    expect(retry.amount).toBe(60000);
  });
});
