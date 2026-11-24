import { formatINR } from "@/modules/shared/money";

/** Keep messages inside a single SMS segment where possible. */
const MAX_LENGTH = 320;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * SMS text is deliberately short and avoids unnecessary patient detail: it is
 * sent to whatever number is on file, so it must make sense on a wrong number
 * as well.
 */
export function receiptMessage(input: {
  hospitalName: string;
  receiptNo: string;
  amountPaise: number;
  invoiceNo: string;
  outstandingPaise: number;
}) {
  return clean(
    `${input.hospitalName}: payment of ${formatINR(input.amountPaise)} received. ` +
      `Receipt ${input.receiptNo}, invoice ${input.invoiceNo}. ` +
      `Balance due ${formatINR(input.outstandingPaise)}. Thank you.`,
  ).slice(0, MAX_LENGTH);
}

export function paymentLinkMessage(input: {
  hospitalName: string;
  invoiceNo: string;
  outstandingPaise: number;
  upiId: string;
}) {
  return clean(
    `${input.hospitalName}: invoice ${input.invoiceNo} has ${formatINR(input.outstandingPaise)} due. ` +
      `Pay by UPI to ${input.upiId} and share the transaction reference with the hospital.`,
  ).slice(0, MAX_LENGTH);
}
