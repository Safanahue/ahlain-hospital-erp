import { describe, expect, it } from "vitest";
import { computeOutstanding } from "@/modules/billing/outstanding";
import { amountInWords, formatINR, rupeesToPaise } from "@/modules/shared/money";

describe("computeOutstanding — outstanding = totalAmount − Σ(SUCCESS payments)", () => {
  it("returns the full total when nothing has been paid", () => {
    expect(computeOutstanding(875_000, 0)).toBe(875_000);
  });

  it("subtracts partial payments (sample invoice: ₹8,750 − ₹3,000)", () => {
    expect(computeOutstanding(875_000, 300_000)).toBe(575_000);
  });

  it("is zero when fully paid", () => {
    expect(computeOutstanding(875_000, 875_000)).toBe(0);
  });

  it("never returns a negative balance", () => {
    expect(computeOutstanding(100_000, 250_000)).toBe(0);
  });

  it("handles zero-value invoices", () => {
    expect(computeOutstanding(0, 0)).toBe(0);
  });
});

describe("money helpers", () => {
  it("formats paise as Indian rupees with en-IN grouping", () => {
    expect(formatINR(875_000)).toBe("₹8,750");
    expect(formatINR(123_456_700)).toBe("₹12,34,567");
    expect(formatINR(875_50)).toBe("₹875.50");
  });

  it("parses rupee inputs to paise", () => {
    expect(rupeesToPaise("8,750")).toBe(875_000);
    expect(rupeesToPaise("8750.50")).toBe(875_050);
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
  });

  it("writes amounts in Indian words", () => {
    expect(amountInWords(875_000)).toBe(
      "Rupees Eight Thousand Seven Hundred Fifty Only",
    );
    expect(amountInWords(100_000_00)).toBe("Rupees One Lakh Only");
    expect(amountInWords(1_234_567_89)).toBe(
      "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only",
    );
  });
});
