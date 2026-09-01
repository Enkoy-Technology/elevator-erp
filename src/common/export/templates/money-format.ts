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
export const formatEtb = (value: string | null | undefined): string =>
  `${formatAmount(value)} ETB`;

/**
 * The same figure without the currency suffix, for a column whose HEADER
 * already names the currency — the client's line table is headed "Unit price
 * /Birr", and repeating "ETB" in every cell under it just doubles the label.
 * The totals block still uses formatEtb: that is where the currency is
 * stated once, in full.
 */
export const formatAmount = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '0.00';
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
  return etbFormatter.format(amount.toNumber());
};

/**
 * A COUNT or a PERCENT, not money: "No of Units" and a payment-term
 * percentage are both stored as exact numerics and read best without forced
 * cents — 1 unit, 50%, and 12.5% rather than 1.00, 50.00% and 12.50%.
 * Parsed through decimal.js all the same, so a numeric(5,2) string never
 * takes a float detour on its way to the page.
 */
export const formatQuantity = (value: string | number | null | undefined): string => {
  if (value == null || value === '') {
    return '—';
  }
  try {
    return new Decimal(String(value).trim()).toString();
  } catch {
    throw new Error(
      `formatQuantity: not a valid decimal: ${JSON.stringify(value)}`,
    );
  }
};

/**
 * The ex-VAT line of the customer's totals block, taken as total MINUS tax
 * rather than re-derived from the pre-margin subtotal.
 *
 * Subtracting is what makes the three printed figures add up to the cent on
 * every path: on a negotiated quote the client prices backward from a round
 * grand total (7,835,000.00 -> 6,813,043.48 + 1,021,956.52), and adding
 * `subtotal + margin` from two independently-rounded columns can land a cent
 * away from the base VAT was actually computed on.
 */
export const netOfTaxEtb = (
  totalEtb: string | null | undefined,
  taxEtb: string | null | undefined,
): string =>
  new Decimal(totalEtb?.trim() || '0')
    .minus(new Decimal(taxEtb?.trim() || '0'))
    .toFixed(2);

/**
 * The VAT rate implied by a subtotal/vat pair, as a "15.00" style percent
 * string. Used for the proforma customer document's "VAT (rate %)" line
 * (proforma-document.mapper.ts) — the proforma no longer stores/joins a raw
 * taxPercent field (see decision (a) in the finance-exports-sms phase-3
 * report), so the rate is derived from the two money columns it does own
 * instead. '0.00' when subtotal is zero/absent (can't divide by zero).
 */
export const vatPercentLabel = (
  subtotalEtb: string | null | undefined,
  vatEtb: string | null | undefined,
): string => {
  const subtotal = new Decimal(subtotalEtb?.trim() || '0');
  if (subtotal.isZero()) {
    return '0.00';
  }
  const vat = new Decimal(vatEtb?.trim() || '0');
  return vat
    .div(subtotal)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
};
