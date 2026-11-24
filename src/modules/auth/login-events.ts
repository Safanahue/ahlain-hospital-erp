import "server-only";
import { prisma } from "@/lib/prisma";

export type LoginFailureReason =
  | "BAD_INPUT"
  | "UNKNOWN_USER"
  | "INACTIVE"
  | "BAD_CREDENTIALS";

export type LoginAttempt = {
  email: string;
  /** Set only when the email matched an account. */
  userId?: string | null;
  success: boolean;
  reason?: LoginFailureReason;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const MAX_FIELD = 300;

function clip(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_FIELD ? value.slice(0, MAX_FIELD) : value;
}

/**
 * Records one sign-in attempt and, on success, stamps the account's
 * lastLoginAt. Never stores the password. Failures here must never block a
 * sign-in, so callers wrap this in try/catch.
 */
export async function recordLoginAttempt(attempt: LoginAttempt) {
  const email = attempt.email.trim().toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.loginEvent.create({
      data: {
        userId: attempt.userId ?? null,
        email,
        success: attempt.success,
        reason: attempt.reason ?? null,
        ipAddress: clip(attempt.ipAddress),
        userAgent: clip(attempt.userAgent),
      },
    });

    if (attempt.success && attempt.userId) {
      await tx.user.update({
        where: { id: attempt.userId },
        data: { lastLoginAt: new Date() },
      });
    }
  });
}

/** Best-effort client address for the audit record (works behind a LAN proxy). */
export function clientAddress(headers: Headers | undefined): string | null {
  if (!headers) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip") ?? null;
}
