import "server-only";
import { prisma } from "@/lib/prisma";
import type { User, Patient, Payment, Invoice } from "@prisma/client";
import { formatINR } from "@/modules/shared/money";
import { getActiveSmsProvider, type SmsSendResult } from "./gateway";
import { renderSmsBody } from "./templates";

/**
 * Normalizes Indian and international mobile numbers into standard E.164.
 * Formats standard 10-digit Indian numbers into +91XXXXXXXXXX.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);

  // Valid 10-digit Indian mobile number (typically starts with 6, 7, 8, 9)
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // Handle other international numbers up to 15 digits
  if (digits.length > 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export interface SendSmsOptions {
  to: string | null | undefined;
  body: string;
  kind: string; // PATIENT_REGISTRATION | RECEIPT | PAYMENT_LINK
  entityId?: string | null;
  userId?: string | null;
  dltTemplateId?: string | null;
}

/**
 * Core Delivery Engine with Database Deduplication
 */
export async function sendSmsWithDeduplication(options: SendSmsOptions): Promise<SmsSendResult> {
  const normalizedTo = normalizeIndianPhone(options.to);

  // 1. Check for missing/invalid phone number
  if (!normalizedTo) {
    const errorMsg = "Patient contact number is missing or invalid";
    const log = await prisma.smsMessage.create({
      data: {
        to: (options.to ?? "UNKNOWN").slice(0, 40),
        body: options.body,
        kind: options.kind,
        status: "SKIPPED",
        provider: "validation",
        error: errorMsg,
        entityId: options.entityId ?? null,
        sentById: options.userId ?? null,
      },
    });
    return {
      success: false,
      status: "SKIPPED",
      provider: "validation",
      error: errorMsg,
      providerMessageId: log.id,
    };
  }

  // 2. Database-level Duplicate Prevention Check
  if (options.entityId) {
    const existingSuccessful = await prisma.smsMessage.findFirst({
      where: {
        entityId: options.entityId,
        kind: options.kind,
        status: "SENT",
      },
    });

    if (existingSuccessful) {
      const skipMsg = `Duplicate prevented: SMS already delivered for ${options.kind} (Ref: ${existingSuccessful.id})`;
      return {
        success: true,
        status: "SKIPPED",
        provider: existingSuccessful.provider,
        providerMessageId: existingSuccessful.providerMessageId,
        error: skipMsg,
      };
    }
  }

  // 3. Resolve Active Provider
  const provider = getActiveSmsProvider();

  // 4. Send Message via Provider
  const result = await provider.send({
    to: normalizedTo,
    body: options.body,
    dltTemplateId: options.dltTemplateId,
  });

  // 5. Audit Log to Database
  await prisma.smsMessage.create({
    data: {
      to: normalizedTo,
      body: options.body,
      kind: options.kind,
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      error: result.error ? result.error.slice(0, 300) : null,
      entityId: options.entityId ?? null,
      sentById: options.userId ?? null,
    },
  });

  return result;
}

/**
 * Master safety switch for automatic SMS dispatches (Registration & Payment receipts).
 * In preparation for safe testing, automatic SMS is strictly disabled by default.
 * It will remain disabled until explicit production activation is approved.
 */
export function isAutoSmsEnabled(): boolean {
  return process.env.ENABLE_AUTO_PATIENT_SMS === "true";
}

/**
 * Asynchronously triggers Patient Registration confirmation SMS.
 * Will NEVER delay patient registration or cause database rollback on network latency.
 */
export function triggerRegistrationSmsAsync(patient: {
  id: string;
  name: string;
  uhid: string;
  phone: string | null;
}, actorId?: string | null) {
  // Safe Guard: Check if automatic patient SMS is enabled
  if (!isAutoSmsEnabled()) {
    console.log(
      `[SMS Safety] Automatic registration SMS is currently DISABLED. Registration for patient ${patient.uhid} (${patient.name}) preserved safely without sending SMS.`
    );
    return;
  }

  // Fire asynchronously without blocking the request
  setTimeout(async () => {
    try {
      const settings = await prisma.hospitalSettings.findFirst({
        select: { hospitalName: true },
      });
      const hospitalName = settings?.hospitalName || "Ahlain Hospital";

      const { body, dltTemplateId } = renderSmsBody("PATIENT_REGISTRATION", {
        hospitalName,
        patientName: patient.name,
        uhid: patient.uhid,
      });

      await sendSmsWithDeduplication({
        to: patient.phone,
        body,
        kind: "PATIENT_REGISTRATION",
        entityId: patient.id,
        userId: actorId ?? null,
        dltTemplateId,
      });
    } catch (err) {
      console.error("[SMS Service] Asynchronous registration SMS failed:", err);
    }
  }, 50);
}

/**
 * Asynchronously triggers Payment Confirmation SMS for OP, IP, Lab, Pharmacy, Dental.
 * Only sends for SUCCESS payments; never for pending or cancelled bills.
 */
export function triggerPaymentReceiptSmsAsync(payment: {
  id: string;
  receiptNo: string;
  amount: number;
  method: string;
  status: string;
  invoiceId: string;
}, actorId?: string | null) {
  if (payment.status !== "SUCCESS") return;

  // Safe Guard: Check if automatic payment SMS is enabled
  if (!isAutoSmsEnabled()) {
    console.log(
      `[SMS Safety] Automatic payment receipt SMS is currently DISABLED. Payment receipt ${payment.receiptNo} recorded safely without sending SMS.`
    );
    return;
  }

  setTimeout(async () => {
    try {
      const [invoice, settings] = await Promise.all([
        prisma.invoice.findUnique({
          where: { id: payment.invoiceId },
          select: {
            invoiceNo: true,
            patient: { select: { name: true, phone: true } },
          },
        }),
        prisma.hospitalSettings.findFirst({
          select: { hospitalName: true },
        }),
      ]);

      if (!invoice || !invoice.patient?.phone) return;

      const hospitalName = settings?.hospitalName || "Ahlain Hospital";
      const formattedAmount = (payment.amount / 100).toFixed(2);

      const { body, dltTemplateId } = renderSmsBody("PAYMENT_RECEIPT", {
        hospitalName,
        amount: formattedAmount,
        method: payment.method,
        receiptNo: payment.receiptNo,
        invoiceNo: invoice.invoiceNo,
      });

      await sendSmsWithDeduplication({
        to: invoice.patient.phone,
        body,
        kind: "RECEIPT",
        entityId: payment.id,
        userId: actorId ?? null,
        dltTemplateId,
      });
    } catch (err) {
      console.error("[SMS Service] Asynchronous payment receipt SMS failed:", err);
    }
  }, 50);
}

/**
 * Query SMS Logs for Admin Dashboard
 */
export async function getSmsLogs(query?: {
  status?: string;
  search?: string;
  take?: number;
  skip?: number;
}) {
  const where: any = {};

  if (query?.status && query.status !== "ALL") {
    where.status = query.status;
  }

  if (query?.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { to: { contains: s } },
      { body: { contains: s } },
      { entityId: { contains: s } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.smsMessage.count({ where }),
    prisma.smsMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query?.take ?? 50,
      skip: query?.skip ?? 0,
      include: {
        sentBy: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  return { total, items };
}

/**
 * Retries dispatch of a previous FAILED or SKIPPED SMS
 */
export async function retrySmsDispatch(smsId: string, actor: User) {
  const existing = await prisma.smsMessage.findUnique({
    where: { id: smsId },
  });

  if (!existing) {
    throw new Error("SMS record not found");
  }

  const normalizedTo = normalizeIndianPhone(existing.to);
  if (!normalizedTo) {
    throw new Error("Recipient phone number is invalid");
  }

  const provider = getActiveSmsProvider();
  const result = await provider.send({
    to: normalizedTo,
    body: existing.body,
  });

  const updated = await prisma.smsMessage.update({
    where: { id: smsId },
    data: {
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? existing.providerMessageId,
      error: result.error ? result.error.slice(0, 300) : null,
      sentById: actor.id,
    },
  });

  return updated;
}
