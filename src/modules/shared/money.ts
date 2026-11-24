// Money helpers. Every amount in the system is an integer in PAISE (₹1 = 100).

/** Format paise as Indian rupees: ₹8,750 / ₹8,750.50 (en-IN grouping). */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = Math.abs(paise) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** Parse a rupee input ("8,750", "8750.50") to paise. Returns null if invalid. */
export function rupeesToPaise(input: string | number): number | null {
  const raw =
    typeof input === "number" ? String(input) : input.replace(/[,₹\s]/g, "");
  if (raw.trim() === "" || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [rupees, fraction = ""] = raw.split(".");
  const paise = fraction.padEnd(2, "0").slice(0, 2);
  return parseInt(rupees, 10) * 100 + parseInt(paise, 10);
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? " " + ONES[o] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Indian numbering: crore / lakh / thousand / hundred. */
export function numberToWordsIndian(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${numberToWordsIndian(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/**
 * Amount in words, Indian format:
 * amountInWords(875000) === "Rupees Eight Thousand Seven Hundred Fifty Only"
 */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const paisePart = paise % 100;
  let words = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paisePart > 0) words += ` and ${twoDigits(paisePart)} Paise`;
  return `${words} Only`;
}
