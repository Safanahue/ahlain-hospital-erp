/**
 * The single source of truth for outstanding balances.
 * outstanding = totalAmount − Σ(SUCCESS payments), floored at zero.
 *
 * Pure module (no Prisma, no server-only) so it is trivially unit-testable.
 */
export function computeOutstanding(
  totalAmount: number,
  successPaidAmount: number,
): number {
  return Math.max(totalAmount - successPaidAmount, 0);
}
