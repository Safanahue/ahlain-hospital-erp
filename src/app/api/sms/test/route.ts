import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/modules/auth/guards";
import { getActiveSmsProvider } from "@/modules/communication/gateway";
import { sendSmsWithDeduplication } from "@/modules/communication/sms-service";

export const dynamic = "force-dynamic";

const REQUIRED_TEST_MESSAGE =
  "AHLAIN Hospital ERP: This is a test SMS. Your SMS gateway integration is being tested successfully.";

const testSmsSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((val) => {
      let digits = val.replace(/\D/g, "");
      if (digits.startsWith("91") && digits.length === 12) {
        digits = digits.slice(2);
      }
      if (digits.startsWith("0") && digits.length === 11) {
        digits = digits.slice(1);
      }
      return digits;
    })
    .refine((val) => /^[6-9]\d{9}$/.test(val), {
      message: "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)",
    }),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm the test SMS dispatch before sending" }),
  }),
});

export async function GET() {
  try {
    // Admin check
    await requireApiUser(["ADMIN"]);
    const activeProvider = getActiveSmsProvider();

    return NextResponse.json({
      provider: activeProvider.name,
      isFast2Sms: activeProvider.name === "fast2sms",
      isConfigured: activeProvider.isConfigured(),
      route: "q",
      messagePreview: REQUIRED_TEST_MESSAGE,
      adminPhoneConfigured: process.env.ADMIN_TEST_PHONE?.trim() || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unauthorized" },
      { status: err.status || 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    // 1. Strictly Admin Only
    const user = await requireApiUser(["ADMIN"]);

    // 2. Verify that the active provider is Fast2SMS
    const activeProvider = getActiveSmsProvider();
    if (activeProvider.name !== "fast2sms") {
      return NextResponse.json(
        {
          success: false,
          error: `Active SMS provider is '${activeProvider.name}'. Test SMS is restricted exclusively to Fast2SMS. Please verify SMS_PROVIDER in your environment.`,
          provider: activeProvider.name,
          httpStatus: 400,
          apiAcceptance: "REJECTED",
          deliveryStatus: "BLOCKED",
        },
        { status: 400 },
      );
    }

    // 3. Validate Input
    const rawBody = await request.json().catch(() => ({}));
    const parsed = testSmsSchema.safeParse(rawBody);

    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const nationalNumber = parsed.data.phone;
    const e164Number = `+91${nationalNumber}`;

    // Optional environment lock for Admin test phone
    const configuredAdminPhone = process.env.ADMIN_TEST_PHONE?.trim();
    if (configuredAdminPhone) {
      const cleanConfigured = configuredAdminPhone.replace(/\D/g, "").slice(-10);
      if (nationalNumber !== cleanConfigured) {
        return NextResponse.json(
          {
            success: false,
            error: `Test messages are restricted exclusively to configured Admin number (+91 ${cleanConfigured}).`,
            provider: "fast2sms",
            httpStatus: 403,
            apiAcceptance: "REJECTED",
            deliveryStatus: "BLOCKED",
          },
          { status: 403 },
        );
      }
    }

    // 4. Dispatch Exactly One SMS via Fast2SMS Quick Route (route=q)
    const result = await sendSmsWithDeduplication({
      to: e164Number,
      body: REQUIRED_TEST_MESSAGE,
      kind: "TEST_SMS",
      entityId: `test-sms-${Date.now()}`,
      userId: user.id,
      dltTemplateId: null, // Forces route=q on Fast2SMS
    });

    if (!result.success || result.status === "FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "SMS dispatch failed at Fast2SMS gateway",
          provider: result.provider,
          httpStatus: 502,
          apiAcceptance: "REJECTED",
          providerResponse: result.rawResponse ?? { message: result.error },
          deliveryStatus: "FAILED",
        },
        { status: 502 },
      );
    }

    // 5. Return Detailed Response with Request ID & Separated Acceptance / Delivery Status
    return NextResponse.json({
      success: true,
      provider: result.provider,
      httpStatus: 200,
      requestId: result.providerMessageId,
      messageContent: REQUIRED_TEST_MESSAGE,
      recipient: e164Number,
      apiAcceptance: "ACCEPTED",
      apiMessage: Array.isArray(result.rawResponse?.message)
        ? result.rawResponse.message.join(", ")
        : result.rawResponse?.message || "SMS request accepted by Fast2SMS",
      providerResponse: result.rawResponse ?? { message: "Accepted by Fast2SMS" },
      deliveryStatus: "HANDED_OVER_TO_OPERATOR",
      deliveryNote:
        "Fast2SMS accepted the request and forwarded it to the Indian telecom operator. Handset delivery typically takes 5 to 30 seconds.",
      sentAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process test SMS" },
      { status: err.status || 500 },
    );
  }
}
