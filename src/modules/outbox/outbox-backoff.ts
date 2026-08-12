/**
 * Exponential backoff by attempt count (task-1-brief.md 5.2): 1m, 5m, 30m,
 * 6h. A pure function, tested for its whole defined domain (attempts 1-4)
 * even though OutboxDispatcherService only ever calls it for attempts 1-3 —
 * the 4th failure goes straight to FAILED instead of scheduling a 5th
 * attempt (see MAX_ATTEMPTS), so the 6h entry is never actually observed as
 * a real nextAttemptAt. It stays in the table anyway: this function
 * documents the full backoff schedule on its own, independent of how the
 * dispatcher currently chooses to use it.
 */
const BACKOFF_MINUTES_BY_ATTEMPT = [1, 5, 30, 360] as const; // 1m, 5m, 30m, 6h

export const MAX_ATTEMPTS = 4;

export function backoffDelayMs(attempts: number): number {
  const index =
    Math.min(Math.max(attempts, 1), BACKOFF_MINUTES_BY_ATTEMPT.length) - 1;
  // Safe: index is clamped to [0, length - 1] above.
  return BACKOFF_MINUTES_BY_ATTEMPT[index]! * 60_000;
}
