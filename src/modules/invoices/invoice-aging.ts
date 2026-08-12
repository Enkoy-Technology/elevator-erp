import { Decimal } from 'decimal.js';

const MS_PER_DAY = 86_400_000;

/** Parses a 'YYYY-MM-DD' date string as a UTC-midnight instant — avoids `new Date(str)`'s local-timezone parsing ambiguity, same approach as fiscal-year.ts/rates.repository.ts's `dayBefore`. */
function toUtcMs(isoDate: string): number {
  return Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
}

/** Whole calendar days `todayIsoStr` is past `referenceDateIso` — negative/zero means not yet due. */
export function daysOverdue(referenceDateIso: string, todayIsoStr: string): number {
  return Math.round((toUtcMs(todayIsoStr) - toUtcMs(referenceDateIso)) / MS_PER_DAY);
}

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

/**
 * Bucket boundaries per the brief: not-yet-due (or due today) is `current`;
 * 1-30 days overdue is `d1_30`; then 31-60, 61-90, and 91+ ("d90_plus" is
 * misleadingly named after its lower bound of 90 — it actually starts at 91,
 * matching its siblings' "upper bound + 1" starting point).
 */
export function bucketForDaysOverdue(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

/**
 * One non-VOID invoice's outstanding amount: totalEtb − whtEtb − Σ
 * allocations. `agingReport` below, `InvoicesRepository.withOutstanding`
 * (the invoice list's own outstandingEtb column), and
 * `recomputeCustomerBalance` (common/customer-balance.ts) all independently
 * arrive at this same formula — see each of their own doc comments for why.
 * Extracted so a later consumer (task-2 brief §2.3's payment reminders)
 * IMPORTS this instead of re-deriving it a fourth time; `agingReport` now
 * calls it too, so the agreement between call sites is enforced by sharing
 * code, not just maintained by convention.
 */
export function invoiceOutstandingEtb(input: {
  totalEtb: string;
  whtEtb: string;
  allocatedEtb: string;
}): Decimal {
  return new Decimal(input.totalEtb).minus(input.whtEtb).minus(input.allocatedEtb);
}
