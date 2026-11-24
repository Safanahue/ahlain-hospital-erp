import { describe, expect, it } from "vitest";
import { normalizeIndianPhone } from "@/modules/communication/sms-service";
import { renderSmsBody, getSmsTemplates, updateSmsTemplate } from "@/modules/communication/templates";
import { getActiveSmsProvider, MockLogProvider } from "@/modules/communication/gateway";

describe("Phase 2 — SMS System & TRAI DLT Compliance", () => {
  describe("Indian Phone Normalization", () => {
    it("normalizes a standard 10-digit Indian mobile number to +91 E.164", () => {
      expect(normalizeIndianPhone("9876543210")).toBe("+919876543210");
    });

    it("strips national trunk prefix 0 and formats to +91", () => {
      expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
    });

    it("handles numbers already with 91 or +91", () => {
      expect(normalizeIndianPhone("919876543210")).toBe("+919876543210");
      expect(normalizeIndianPhone("+919876543210")).toBe("+919876543210");
    });

    it("returns null for invalid or missing numbers", () => {
      expect(normalizeIndianPhone("")).toBeNull();
      expect(normalizeIndianPhone(null)).toBeNull();
      expect(normalizeIndianPhone("12345")).toBeNull();
    });
  });

  describe("Template Engine & DLT Placeholders", () => {
    it("renders patient registration SMS with parameters", () => {
      const rendered = renderSmsBody("PATIENT_REGISTRATION", {
        hospitalName: "Ahlain Hospital",
        patientName: "Rahul Sharma",
        uhid: "AH-2026-000123",
      });

      expect(rendered.body).toContain("Rahul Sharma");
      expect(rendered.body).toContain("AH-2026-000123");
      expect(rendered.body).toContain("Ahlain Hospital");
      expect(rendered.dltTemplateId).toBeDefined();
    });

    it("renders payment receipt SMS with parameters", () => {
      const rendered = renderSmsBody("PAYMENT_RECEIPT", {
        hospitalName: "Ahlain Hospital",
        amount: "1500.00",
        method: "UPI",
        receiptNo: "RCPT-2026-00045",
        invoiceNo: "AH-INV-2026-00099",
      });

      expect(rendered.body).toContain("Rs. 1500.00");
      expect(rendered.body).toContain("RCPT-2026-00045");
      expect(rendered.body).toContain("AH-INV-2026-00099");
    });

    it("allows admin to customize template wording", () => {
      updateSmsTemplate("PATIENT_REGISTRATION", "Welcome {patientName} to our clinic! ID: {uhid}");
      const rendered = renderSmsBody("PATIENT_REGISTRATION", {
        patientName: "Aisha",
        uhid: "AH-2026-000999",
      });

      expect(rendered.body).toBe("Welcome Aisha to our clinic! ID: AH-2026-000999");
    });
  });

  describe("Provider-Independent Gateway", () => {
    it("defaults to safe MockLogProvider when no live gateway credentials are set", () => {
      const provider = getActiveSmsProvider();
      expect(provider).toBeDefined();
      expect(provider.name).toBe("log_only");
    });

    it("MockLogProvider safely logs as SKIPPED without throwing or making network requests", async () => {
      const mock = new MockLogProvider();
      const result = await mock.send({
        to: "+919876543210",
        body: "Test message",
      });

      expect(result.status).toBe("SKIPPED");
      expect(result.success).toBe(true);
      expect(result.error).toContain("Live SMS gateway credentials not configured");
    });
  });
});
