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
