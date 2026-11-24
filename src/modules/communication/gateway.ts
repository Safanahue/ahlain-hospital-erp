import "server-only";

export type SmsStatusValue = "SENT" | "FAILED" | "SKIPPED";

export interface SmsSendInput {
  to: string; // E.164 normalized (+91XXXXXXXXXX)
  body: string;
  dltTemplateId?: string | null;
  dltEntityId?: string | null;
}

export interface SmsSendResult {
  success: boolean;
  status: SmsStatusValue;
  provider: string;
  providerMessageId?: string | null;
  error?: string | null;
  rawResponse?: any;
}

export interface ISmsProvider {
  name: string;
  isConfigured(): boolean;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

/**
 * 1. Mock / Log-Only Provider
 * Safe default when live SMS credentials are not yet configured.
 * It records the message into the database as SKIPPED so no patient data is lost,
 * without attempting unauthorized external network calls.
 */
export class MockLogProvider implements ISmsProvider {
  name = "log_only";

  isConfigured(): boolean {
    return true; // Always operational as safe logging fallback
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    return {
      success: true,
      status: "SKIPPED",
      provider: this.name,
      providerMessageId: `mock_${Date.now()}`,
      error: "Live SMS gateway credentials not configured (Logged to Outbox safely)",
    };
  }
}

/**
 * 2. Indian DLT HTTP Gateway Provider
 * Works with any Indian TRAI DLT-compliant SMS aggregator (Fast2SMS, MSG91, Textlocal, etc.)
 * Activated when SMS_GATEWAY_URL and SMS_API_KEY are configured in environment.
 */
export class IndianDltProvider implements ISmsProvider {
  name = "indian_dlt";

  isConfigured(): boolean {
    return !!(process.env.SMS_GATEWAY_URL?.trim() && process.env.SMS_API_KEY?.trim());
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const url = process.env.SMS_GATEWAY_URL?.trim();
    const apiKey = process.env.SMS_API_KEY?.trim();
    const senderId = process.env.SMS_SENDER_ID?.trim() || "AHLAIN";
    const entityId = process.env.SMS_DLT_ENTITY_ID?.trim() || input.dltEntityId || "";

    if (!url || !apiKey) {
      return {
        success: false,
        status: "SKIPPED",
        provider: this.name,
        error: "Indian SMS gateway URL or API key is missing",
      };
    }

    try {
      // Remove + prefix for Indian domestic gateway formats if required
      const nationalNumber = input.to.startsWith("+91")
        ? input.to.slice(3)
        : input.to.replace(/\D/g, "");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          sender: senderId,
          numbers: nationalNumber,
          message: input.body,
          template_id: input.dltTemplateId || undefined,
          entity_id: entityId || undefined,
        }),
        signal: AbortSignal.timeout(8000),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          status: "FAILED",
          provider: this.name,
          error: (payload as any)?.message || `Gateway returned HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        status: "SENT",
        provider: this.name,
        providerMessageId: (payload as any)?.message_id || (payload as any)?.id || `dlt_${Date.now()}`,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        provider: this.name,
        error: err instanceof Error ? err.message : "Indian DLT gateway request timed out",
      };
    }
  }
}

/**
 * 3. Twilio International Provider (Backward Compatible)
 */
export class TwilioProvider implements ISmsProvider {
  name = "twilio";

  isConfigured(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim()
    );
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim();

    if (!sid || !token || !from) {
      return {
        success: false,
        status: "SKIPPED",
        provider: this.name,
        error: "Twilio credentials missing",
      };
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: input.to,
            From: from,
            Body: input.body,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        return {
          success: false,
          status: "FAILED",
          provider: this.name,
          error: payload?.message || `Twilio HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        status: "SENT",
        provider: this.name,
        providerMessageId: payload?.sid || null,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        provider: this.name,
        error: err instanceof Error ? err.message : "Twilio dispatch failed",
      };
    }
  }
}

/**
 * 4. Fast2SMS Official Provider (India)
 * Official endpoint: https://www.fast2sms.com/dev/bulkV2
 */
export class Fast2SmsProvider implements ISmsProvider {
  name = "fast2sms";

  isConfigured(): boolean {
    const provider = process.env.SMS_PROVIDER?.trim().toLowerCase();
    const apiKey = process.env.SMS_API_KEY?.trim();
    return (provider === "fast2sms" || !provider) && !!apiKey;
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const apiKey = process.env.SMS_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        status: "SKIPPED",
        provider: this.name,
        error: "Fast2SMS API key missing",
      };
    }

    try {
      const nationalNumber = input.to.startsWith("+91")
        ? input.to.slice(3)
        : input.to.replace(/\D/g, "");

      // If DLT template ID is explicitly supplied and enabled, use DLT route;
      // otherwise use Quick SMS route "q" (free text delivery without custom DLT approval)
      const isDlt = !!(input.dltTemplateId && process.env.FAST2SMS_ROUTE === "dlt");
      const senderId = process.env.SMS_SENDER_ID?.trim() || "FSTSMS";

      const payload = isDlt
        ? {
            route: "dlt",
            sender_id: senderId,
            message: input.dltTemplateId,
            numbers: nationalNumber,
          }
        : {
            route: "q",
            message: input.body,
            language: "english",
            flash: 0,
            numbers: nationalNumber,
          };

      const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const data = (await response.json().catch(() => ({}))) as any;

      if (!response.ok || data.return === false) {
        const errorText = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || `Fast2SMS HTTP ${response.status}`;
        return {
          success: false,
          status: "FAILED",
          provider: this.name,
          error: errorText,
          rawResponse: data,
        };
      }

      const msgId = Array.isArray(data.request_id)
        ? data.request_id.join(",")
        : data.request_id || `fast2sms_${Date.now()}`;

      return {
        success: true,
        status: "SENT",
        provider: this.name,
        providerMessageId: msgId,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        provider: this.name,
        error: err instanceof Error ? err.message : "Fast2SMS connection timeout",
      };
    }
  }
}

/**
 * Active Provider Resolver
 * Resolves SMS_PROVIDER ("fast2sms" | "indian_dlt" | "twilio" | "log_only")
 */
export function getActiveSmsProvider(): ISmsProvider {
  const providerType = process.env.SMS_PROVIDER?.trim().toLowerCase();

  if (providerType === "fast2sms") {
    const fast2sms = new Fast2SmsProvider();
    if (fast2sms.isConfigured()) return fast2sms;
  }

  const indianDlt = new IndianDltProvider();
  if (indianDlt.isConfigured()) return indianDlt;

  const twilio = new TwilioProvider();
  if (twilio.isConfigured()) return twilio;

  const fast2smsFallback = new Fast2SmsProvider();
  if (fast2smsFallback.isConfigured()) return fast2smsFallback;

  return new MockLogProvider();
}
