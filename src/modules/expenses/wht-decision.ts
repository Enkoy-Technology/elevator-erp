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
 * actual percent/amount. WHT_NO_TIN has no threshold — it always applies.
 * WHT_GOODS/WHT_SERVICES compare `netEtb` against the payload's
 * `thresholdEtb` (inclusive — brief's own matrix: GOODS 20,000.00 IS
 * withheld, 19,999.99 is not), applying the payload's percent at or above
 * threshold and 0 below it. Callers still store the resolved rateVersionId
 * regardless of which branch this returns — that's the caller's job (see
 * expenses.service.ts), not this pure function's.
 */
export function computeWithholding(
  kind: WhtKind,
  netEtb: string,
  payload: { percent: string; thresholdEtb?: string },
): WhtComputation {
  if (kind === 'WHT_NO_TIN') {
    return applyRate(netEtb, payload.percent);
  }
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
