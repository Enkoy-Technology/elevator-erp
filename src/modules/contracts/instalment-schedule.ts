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

/** A percentage row of the proforma's payment schedule ("50% on signing"). */
export interface PercentTerm {
  label: string;
  /** A 2dp string, as stored. */
  percent: string;
}

/**
 * The proforma's percentage schedule as contract instalments in ETB, or null
 * when the percentages do not make a whole (a deposit-only proforma) — a
 * partial schedule would fail `scheduleMismatchReason` the first time anyone
 * touched it, so the draft is better left without one.
 *
 * Each row is the exact percentage rounded to the cent; the largest row
 * takes whatever rounding left over (never the last — a trailing 0% term
 * would go negative), so the rows add up to the contract value exactly,
 * which is the rule the schedule is checked against everywhere.
 */
export const instalmentsFromPercents = (
  terms: readonly PercentTerm[],
  contractValueEtb: string,
): Array<ScheduleLine & { label: string }> | null => {
  if (terms.length === 0) {
    return null;
  }
  const hundred = terms.reduce(
    (acc, t) => acc.plus(new Decimal(t.percent)),
    new Decimal(0),
  );
  if (!hundred.equals(100)) {
    return null;
  }
  const total = new Decimal(contractValueEtb);
  const lines = terms.map((t) => ({
    label: t.label,
    amountEtb: total.mul(new Decimal(t.percent)).div(100).toFixed(2),
  }));
  const largest = terms.reduce(
    (best, t, i) =>
      new Decimal(t.percent).gt(new Decimal(terms[best]!.percent)) ? i : best,
    0,
  );
  const others = lines
    .filter((_, i) => i !== largest)
    .reduce((acc, l) => acc.plus(new Decimal(l.amountEtb)), new Decimal(0));
  lines[largest]!.amountEtb = total.minus(others).toFixed(2);
  return lines;
};
