import { Decimal } from 'decimal.js';

/** The one field the schedule arithmetic cares about. */
export interface ScheduleLine {
  amountEtb: string;
}

/**
 * Sum of an instalment schedule as a 2dp money string.
 *
 * Decimal, not float: these are the figures printed on the customer's
 * payment schedule and reconciled against the contract value, so a
 * 0.1 + 0.2 style drift would surface as a contract that "doesn't add up".
 */
export const scheduleTotalEtb = (lines: readonly ScheduleLine[]): string =>
  lines
    .reduce((acc, line) => acc.plus(new Decimal(line.amountEtb)), new Decimal(0))
    .toFixed(2);

/**
 * Why the schedule may not be saved, or null when it may.
 *
 * The rule is exact equality with the contract value, not a tolerance and
 * not "at most the contract value". A deposit and a retention are both
 * *parts* of the agreed value (20% advance + 70% on delivery + 10%
 * retention still totals 100%), so the real-world cases people reach for as
 * exceptions are all covered by requiring the parts to add up. What exact
 * equality actually catches is the typo — a 350,000 keyed as 35,000 — and
 * that is a mistake nobody notices until the customer pays the smaller
 * number and points at the signed schedule.
 *
 * An empty schedule is allowed: that is how a schedule gets cleared, not a
 * schedule that fails to add up.
 */
export const scheduleMismatchReason = (
  lines: readonly ScheduleLine[],
  contractValueEtb: string,
): string | null => {
  if (lines.length === 0) {
    return null;
  }
  const total = scheduleTotalEtb(lines);
  if (new Decimal(total).equals(new Decimal(contractValueEtb))) {
    return null;
  }
  return `Instalments total ${total} ETB but the contract value is ${new Decimal(contractValueEtb).toFixed(2)} ETB — a payment schedule must add up to the agreed value (a deposit or a retention is a part of it, not an extra).`;
};
