import { Decimal } from 'decimal.js';

/**
 * Splits a billed expense amount into net/VAT/gross, decimal.js throughout,
 * HALF_UP, 2dp — same rounding discipline as invoice-money.ts. Two shapes,
 * matching the two ways a supplier bill can be recorded (brief 4.1 step 2):
 *
 * - vatIncluded=false: `netEtb` is what's given. `vatEtb = net * rate / 100`
 *   (rounded once), `grossEtb = net + vatEtb` (exact — both operands are
 *   already 2dp, so no further rounding is needed or applied).
 * - vatIncluded=true: `grossEtb` is what's given. `netEtb = gross / (1 +
 *   rate/100)` (rounded once), `vatEtb = gross - netEtb`.
 *
 * Rounding-residual convention (pinned by expense-money.spec.ts): in the
 * inclusive path, VAT is ALWAYS the derived leg (`gross - net`), never
 * independently rounded. That guarantees `net + vat === gross` exactly by
 * construction — there is no separate rounding step for vat to disagree
 * with net's — and lands any residual cent from the division on VAT, not on
 * net. This mirrors invoice-money.ts's own single-rounding-point rule and
 * is why a prior phase's cent-drift bug (rounding both legs independently)
 * cannot recur here.
 */
export interface ExpenseMoneySplit {
  netEtb: string;
  vatEtb: string;
  grossEtb: string;
}

export function splitVatExclusive(netEtb: string, vatRatePercent: string): ExpenseMoneySplit {
  const net = new Decimal(netEtb);
  const vat = net
    .mul(vatRatePercent)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    netEtb: net.toFixed(2),
    vatEtb: vat.toFixed(2),
    grossEtb: net.plus(vat).toFixed(2),
  };
}

export function splitVatInclusive(grossEtb: string, vatRatePercent: string): ExpenseMoneySplit {
  const gross = new Decimal(grossEtb);
  const net = gross
    .div(new Decimal(vatRatePercent).div(100).plus(1))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    netEtb: net.toFixed(2),
    vatEtb: gross.minus(net).toFixed(2),
    grossEtb: gross.toFixed(2),
  };
}
