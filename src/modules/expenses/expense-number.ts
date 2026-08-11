/**
 * Renders a claimed sequence value as a customer-facing expense number.
 *
 * Format decision: `EXP-{fiscalYearLabel}-{seq}`, e.g. `EXP-FY2026-27-0001`
 * — same format family as buildInvoiceNumber/buildReceiptNumber: a `/` in
 * `fiscalYearLabel` is rendered as `-` so the number stays filename/URL
 * safe. A reversal claims its own number through this same function — it is
 * its own document, not an edit of the original's.
 */
export function buildExpenseNumber(fiscalYearLabel: string, seq: number): string {
  const filenameSafeLabel = fiscalYearLabel.replace('/', '-');
  return `EXP-${filenameSafeLabel}-${String(seq).padStart(4, '0')}`;
}
