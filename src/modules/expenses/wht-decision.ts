import { Decimal } from 'decimal.js';

import type { SupplyKind } from '../../database/schema';

/** Ethiopian domestic-withholding kinds — see the rate table's own rate-payloads.ts schemas. */
export type WhtKind = 'WHT_NO_TIN' | 'WHT_GOODS' | 'WHT_SERVICES';

/**
 * Step 3 of the brief's compute order: which WHT rate kind applies, decided
 * purely from supplier documentation and supply kind — no rate lookup here.
 * `!supplierTin || !supplierLicenceOnFile` (either missing) forces the 30%
 * no-threshold kind; otherwise the 3% kind by supply kind.
 */
export function selectWhtKind(input: {
  supplierTin?: string;
  supplierLicenceOnFile: boolean;
  supplyKind: SupplyKind;
}): WhtKind {
  if (!input.supplierTin || !input.supplierLicenceOnFile) {
    return 'WHT_NO_TIN';
  }
  return input.supplyKind === 'GOODS' ? 'WHT_GOODS' : 'WHT_SERVICES';
}

export interface WhtComputation {
  /** Always stored, even when whtEtb is '0.00' — see rateVersionId's schema comment. */
  ratePercent: string;
  whtEtb: string;
}

/**
 * Step 4-5: given the already-resolved rate payload for `kind`, decides the
 * actual percent/amount. `netEtb` is compared against the payload's
 * `thresholdEtb` (inclusive — brief's own matrix: GOODS 20,000.00 IS
 * withheld, 19,999.99 is not), applying the payload's percent at or above
 * threshold and 0 below it. A missing `thresholdEtb` defaults to '0' —
 * "no threshold, always applies" — which is the ONLY behaviour every kind
 * has ever had until a real threshold is entered as data.
 *
 * R7 (decisions doc §8.5): this reads `thresholdEtb` uniformly for EVERY
 * kind, including WHT_NO_TIN — deliberately, so that kind is no longer a
 * special case here. WHT_NO_TIN's seeded payload (seed-rates.ts) has no
 * `thresholdEtb` today, so `applyRate` still runs unconditionally for it in
 * practice (a 200 ETB no-TIN receipt still gets 30% withheld — Ethiopian
 * tax law states no documented de-minimis exemption for that rate, and this
 * codebase does not invent tax policy). The day a tax practitioner confirms
 * a real threshold, entering it on the WHT_NO_TIN rate version is a
 * `POST /rates` data change — this function needs no code change to honour
 * it, matching this project's "rates are data, never constants" rule.
 * Callers still store the resolved rateVersionId regardless of which branch
 * this returns — that's the caller's job (see expenses.service.ts), not
 * this pure function's.
 */
export function computeWithholding(
  kind: WhtKind,
  netEtb: string,
  payload: { percent: string; thresholdEtb?: string },
): WhtComputation {
  const threshold = new Decimal(payload.thresholdEtb ?? '0');
  if (new Decimal(netEtb).lt(threshold)) {
    return { ratePercent: '0.00', whtEtb: '0.00' };
  }
  return applyRate(netEtb, payload.percent);
}

function applyRate(netEtb: string, ratePercent: string): WhtComputation {
  const whtEtb = new Decimal(netEtb)
    .mul(ratePercent)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { ratePercent: new Decimal(ratePercent).toFixed(2), whtEtb: whtEtb.toFixed(2) };
}
