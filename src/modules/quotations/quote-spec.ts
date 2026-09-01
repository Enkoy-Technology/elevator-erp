import Decimal from 'decimal.js';

import type { FloorPlan } from '../../common/floor-plan';

// The floor-plan vocabulary lives in /common so the proforma mapper can
// reach it too (a module may not import from another module). Re-exported
// here so this module's own callers are unaffected.
export {
  describeFloorPlan,
  parseFloorLabels,
  type FloorPlan,
} from '../../common/floor-plan';

/**
 * The human cell of page 1's line table, e.g.
 * "800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors".
 * Only ever a DEFAULT: `quotation_lines.spec_summary` is stored, so a line
 * the salesperson worded themselves is never re-derived over.
 */
export const buildSpecSummary = (input: {
  capacityKg?: number | null;
  capacityPersons?: number | null;
  speedMs?: number | null;
  plan?: FloorPlan | null;
}): string | null => {
  const segments: string[] = [];
  if (input.capacityKg != null) {
    segments.push(
      input.capacityPersons != null
        ? `${input.capacityKg}KG -${input.capacityPersons}persons`
        : `${input.capacityKg}KG`,
    );
  }
  if (input.speedMs != null) {
    segments.push(`Speed ${input.speedMs}m/s`);
  }
  if (input.plan) {
    segments.push(input.plan.displaySummary);
    segments.push(`${input.plan.floors} floors/${input.plan.doors} doors`);
  }
  return segments.length > 0 ? segments.join(' / ') : null;
};

/** The one field the payment-schedule arithmetic cares about. */
export interface PaymentTermLine {
  percent: string;
}

/**
 * Why the payment schedule may not be saved, or null when it may.
 *
 * Exactly 100, not a tolerance: their four instalments (50/30/10/10) ARE the
 * whole price, and the mistake worth catching is the typo — a 30 keyed as 3
 * — which nobody notices until the customer pays the smaller number and
 * points at the offer. Same rule and same reasoning as
 * `scheduleMismatchReason` for contract instalments.
 *
 * An empty schedule is allowed: that is how a schedule gets cleared.
 */
export const paymentTermsMismatchReason = (
  terms: readonly PaymentTermLine[],
): string | null => {
  if (terms.length === 0) {
    return null;
  }
  const total = terms.reduce(
    (sum, term) => sum.plus(new Decimal(term.percent)),
    new Decimal(0),
  );
  if (total.equals(100)) {
    return null;
  }
  return `Payment terms total ${total.toFixed(2)}% — a payment schedule must add up to exactly 100% of the quoted price.`;
};
