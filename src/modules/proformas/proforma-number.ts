/**
 * Renders a claimed sequence value as a customer-facing proforma number.
 *
 * Format decision: `PF-{fiscalYearLabel}-{seq}`, e.g. `PF-FY2026-27-0001`.
 * `computeFiscalYear` labels a year `FY2026/27` for display, but a `/` in a
 * document number is awkward wherever the number becomes a filename or a URL
 * segment — so the label's `/` is rendered as `-` here. The DB column
 * `proformas.fiscalYearLabel` keeps the original slash form (`FY2026/27`)
 * for display; only the rendered document number is filename-safe.
 */
export function buildProformaNumber(
  fiscalYearLabel: string,
  seq: number,
): string {
  const filenameSafeLabel = fiscalYearLabel.replace('/', '-');
  return `PF-${filenameSafeLabel}-${String(seq).padStart(4, '0')}`;
}
