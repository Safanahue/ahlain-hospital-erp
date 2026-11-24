import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveSmsProvider } from "./gateway";
import { normalizeIndianPhone, sendSmsWithDeduplication } from "./sms-service";

export type SmsKind = "RECEIPT" | "PAYMENT_LINK" | "PATIENT_REGISTRATION" | "TEST_SMS";
export type SmsStatusValue = "SENT" | "FAILED" | "SKIPPED";

export type SmsResult = {
  status: SmsStatusValue;
  /** Normalised E.164 number, or null when the stored phone was unusable. */
  to: string | null;
  providerMessageId?: string | null;
  error?: string | null;
};

/**
 * Checks if a real, live SMS provider (Fast2SMS, Indian DLT, or Twilio) is configured.
 */
export function isSmsConfigured(): boolean {
  const provider = getActiveSmsProvider();
  return provider.name !== "log_only" && provider.isConfigured();
}

/**
 * Normalises Indian mobile numbers to E.164. Accepts 10-digit numbers,
 * numbers with a leading 0, numbers already prefixed with 91, and
 * international numbers up to 15 digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  return normalizeIndianPhone(raw);
}

/**
 * Backward compatibility helper for legacy config checks.
 */
export function getSmsConfig() {
  const provider = getActiveSmsProvider();
  if (provider.name !== "log_only" && provider.isConfigured()) {
    return { provider: provider.name };
  }
  return null;
}

/**
 * Sends one SMS via the configured gateway (Fast2SMS, DLT, Twilio)
 * and writes a log row to the database.
 */
export async function sendSms(input: {
  to: string | null | undefined;
  body: string;
  kind: SmsKind | string;
  entityId?: string | null;
  userId?: string | null;
  dltTemplateId?: string | null;
  allowResend?: boolean;
}): Promise<SmsResult> {
  const to = normalizeIndianPhone(input.to);

  if (!to) {
    const error = "Patient phone number is missing or invalid";
    await prisma.smsMessage.create({
      data: {
        to: (input.to ?? "UNKNOWN").slice(0, 40),
        body: input.body,
        kind: input.kind,
        status: "SKIPPED",
        provider: "validation",
        error,
        entityId: input.entityId ?? null,
        sentById: input.userId ?? null,
      },
    });
    return { status: "SKIPPED", to: null, error };
  }

  const provider = getActiveSmsProvider();
  if (provider.name === "log_only" || !provider.isConfigured()) {
    const error = "SMS gateway is not configured on this server";
    await prisma.smsMessage.create({
      data: {
        to,
        body: input.body,
        kind: input.kind,
        status: "SKIPPED",
        provider: provider.name,
        error,
        entityId: input.entityId ?? null,
        sentById: input.userId ?? null,
      },
    });
    return { status: "SKIPPED", to, error };
  }

  const res = await sendSmsWithDeduplication({
    to,
    body: input.body,
    kind: input.kind,
    entityId: input.allowResend ? undefined : (input.entityId ?? undefined),
    userId: input.userId,
    dltTemplateId: input.dltTemplateId,
  });

  return {
    status: res.status,
    to,
    providerMessageId: res.providerMessageId,
    error: res.error,
  };
}
