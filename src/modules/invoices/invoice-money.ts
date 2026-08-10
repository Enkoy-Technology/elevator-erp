import { Decimal } from 'decimal.js';

/**
 * A standalone invoice line's total: quantity × unitPrice, rounded HALF_UP
 * to 2dp at this single point (matches `invoice_lines.line_total_etb`'s
 * numeric(14,2) column, and the elevator-calc convention of one rounding
 * point per money value — see calc-math.ts's `money()`). `quantity` is a
 * decimal string with up to 3dp (matches `quantity` numeric(12,3));
 * `unitPriceEtb` up to 2dp (matches `unit_price_etb` numeric(14,2)) — both
 * validated at the DTO boundary (CreateInvoiceLineDto), never coerced
 * through a JS number here.
 */
export function computeLineTotal(quantity: string, unitPriceEtb: string): string {
  return new Decimal(quantity)
    .mul(unitPriceEtb)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

/** Sum of already-2dp-rounded line totals — exact, no further rounding needed. */
export function sumLineTotals(lineTotalsEtb: string[]): string {
  return lineTotalsEtb
    .reduce((sum, v) => sum.plus(v), new Decimal(0))
    .toFixed(2);
}
