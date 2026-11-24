/**
 * Phase 6 — printed document text. Admin-editable settings fall back to these
 * defaults, so a blank settings field never leaves a printed page without a
 * footer.
 */
export function receiptFooterText(
  custom: string | null | undefined,
  hospitalName: string,
) {
  const trimmed = custom?.trim();
  if (trimmed) return trimmed;
  return `This is a computer-generated receipt from ${hospitalName}. Payments are verified and reconciled with the hospital payment account.`;
}

export function invoiceFooterText(
  custom: string | null | undefined,
  hospitalName: string,
) {
  const trimmed = custom?.trim();
  if (trimmed) return trimmed;
  return `This is a computer-generated invoice from ${hospitalName}. Please retain it for your records.`;
}

/** Terms block for the printed invoice; null means "do not print a block". */
export function termsBlock(terms: string | null | undefined): string | null {
  const trimmed = terms?.trim();
  return trimmed ? trimmed : null;
}
