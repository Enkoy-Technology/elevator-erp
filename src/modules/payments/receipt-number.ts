/**
 * Renders a claimed sequence value as a customer-facing receipt number.
 *
 * Format decision: `RCT-{fiscalYearLabel}-{seq}`, e.g. `RCT-FY2026-27-0001`
 * — same format family as `buildInvoiceNumber`/`buildProformaNumber`: a `/`
 * in `fiscalYearLabel` (e.g. `FY2026/27`) is rendered as `-` so the number
 * stays filename/URL safe. A reversal claims its own number through this
 * same function — it is its own document, not an edit of the original's.
 */
export function buildReceiptNumber(fiscalYearLabel: string, seq: number): string {
  const filenameSafeLabel = fiscalYearLabel.replace('/', '-');
  return `RCT-${filenameSafeLabel}-${String(seq).padStart(4, '0')}`;
}
