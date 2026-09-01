/**
 * Renders a claimed sequence value as a customer-facing contract number.
 *
 * Same rule as buildProformaNumber (proforma-number.ts): `CNT-{fy}-{seq}`,
 * e.g. `CNT-FY2026-27-0001`. `computeFiscalYear` labels a year `FY2026/27`
 * for display, but a `/` is awkward wherever the number becomes a filename
 * or a URL segment, so the label's `/` is rendered as `-` here. The DB
 * column `contracts.fiscalYearLabel` keeps the slash form for display.
 */
export function buildContractNumber(
  fiscalYearLabel: string,
  seq: number,
): string {
  const filenameSafeLabel = fiscalYearLabel.replace('/', '-');
  return `CNT-${filenameSafeLabel}-${String(seq).padStart(4, '0')}`;
}
