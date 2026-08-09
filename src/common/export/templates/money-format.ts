import { Decimal } from 'decimal.js';

const etbFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Single source of truth for rendering a decimal money string as
 * "1,234.50 ETB" — both the PDF (quotation.template.ts) and Word
 * (quotation.docx-template.ts) renderers call this, so the two documents
 * always show identical figures for the same quote.
 *
 * null/undefined/'' (no amount entered yet) -> "0.00 ETB". A non-parseable
 * string throws: this renders on a customer-facing document, so silently
 * coercing garbage input to 0.00 would misstate money rather than surface
 * the bug.
 */
export const formatEtb = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '0.00 ETB';
  }
  let amount: Decimal;
  try {
    // decimal.js does not trim internally — new Decimal('  1.00  ') throws
    // — so incidental whitespace (hand-edited/copy-pasted field) must not
    // fail parsing on its own; only genuinely non-numeric content should.
    amount = new Decimal(trimmed);
  } catch {
    throw new Error(
      `formatEtb: not a valid decimal money string: ${JSON.stringify(value)}`,
    );
  }
  // decimal.js just validates/parses here — ETB amounts are schema-bounded
  // to numeric(14,2), well inside float64's exact-integer range, so
  // toNumber() loses no precision before Intl formats the thousands groups.
  return `${etbFormatter.format(amount.toNumber())} ETB`;
};
