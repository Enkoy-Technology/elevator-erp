/**
 * Renders a claimed sequence value as a customer-facing invoice number.
 *
 * Format decision: `INV-{fiscalYearLabel}-{seq}`, e.g. `INV-FY2026-27-0001`
 * — same format family as `buildProformaNumber` (proforma-number.ts): a `/`
 * in `fiscalYearLabel` (e.g. `FY2026/27`) is rendered as `-` so the number
 * stays filename/URL safe. The DB column `invoices.fiscalYearLabel` keeps
 * the original slash form for display; only the rendered document number is
 * filename-safe.
 */
export function buildInvoiceNumber(
  fiscalYearLabel: string,
  seq: number,
): string {
  const filenameSafeLabel = fiscalYearLabel.replace('/', '-');
  return `INV-${filenameSafeLabel}-${String(seq).padStart(4, '0')}`;
}
