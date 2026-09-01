import { Decimal } from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Pure money arithmetic for a quotation's totals. No I/O, no DB, no Nest —
 * this is the module an auditor's numbers rest on, so it stays testable in
 * isolation and every amount crosses the boundary as a 2-decimal ETB string
 * (numeric(14, 2) columns are read/written as strings; float never touches
 * money here).
 */

const parse = (value: string, label: string): Decimal => {
  let parsed: Decimal;
  try {
    // String() so a null/undefined arriving from a nullable numeric column
    // fails with this message rather than an opaque TypeError; decimal.js
    // also does not trim internally, so hand-edited whitespace must not
    // fail parsing on its own.
    parsed = new Decimal(String(value).trim());
  } catch {
    throw new Error(
      `${label}: not a valid decimal money string: ${JSON.stringify(value)}`,
    );
  }
  if (!parsed.isFinite()) {
    throw new Error(
      `${label}: must be a finite amount: ${JSON.stringify(value)}`,
    );
  }
  return parsed;
};

const money = (value: Decimal): string =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

/**
 * Split a round grand total into its ex-tax and tax parts.
 *
 * The client (Shining Star) prices BACKWARD: they agree a round
 * VAT-inclusive figure with the customer and the document's other two lines
 * are derived from it. Their real proforma: 7,835,000.00 total ->
 * 6,813,043.48 ex-VAT + 1,021,956.52 VAT.
 *
 * The tax is SUBTRACTED, never recomputed as subtotal * rate — subtracting
 * is what guarantees `subtotal + tax === total` to the cent for every input,
 * which recomputation does not (100.00 at 15% would give 86.96 + 13.04 by
 * subtraction but 86.96 + 13.044 -> 13.04 or 13.05 by multiplication,
 * depending on the amount).
 */
export const deriveFromGrandTotal = (
  grandTotalEtb: string,
  taxPercent: string,
): { subtotalEtb: string; taxAmountEtb: string; totalEtb: string } => {
  const grandTotal = parse(grandTotalEtb, "grandTotalEtb");
  const rate = parse(taxPercent, "taxPercent");
  if (grandTotal.isNegative()) {
    throw new Error(
      `deriveFromGrandTotal: grandTotalEtb must not be negative: ${JSON.stringify(grandTotalEtb)}`,
    );
  }
  if (rate.isNegative()) {
    throw new Error(
      `deriveFromGrandTotal: taxPercent must not be negative: ${JSON.stringify(taxPercent)}`,
    );
  }
  // The returned total is the rounded one, so the invariant holds against
  // what this function actually reports rather than against its raw input.
  const total = grandTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const subtotal = total
    .div(rate.div(100).plus(1))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    subtotalEtb: subtotal.toFixed(2),
    taxAmountEtb: total.minus(subtotal).toFixed(2),
    totalEtb: total.toFixed(2),
  };
};

/**
 * Spread a negotiated subtotal across line items pro-rata by each line's
 * list total, using largest-remainder so the returned amounts sum to
 * `targetSubtotalEtb` EXACTLY — no stray cent left over or double-counted.
 *
 * Works for a premium (target above the list sum) as well as a discount.
 * A zero-value line always receives '0.00': its exact share is a whole
 * number of cents, so it never wins a remainder cent while any line with a
 * fractional share is still waiting.
 *
 * When every list total is zero there is nothing to pro-rate over, so the
 * target is split equally (the limit of pro-rata as the weights converge)
 * rather than thrown away or rejected — a quote whose lines are all priced
 * at zero still has to place its negotiated total somewhere.
 */
export const allocateToLines = (
  lineListTotalsEtb: readonly string[],
  targetSubtotalEtb: string,
): string[] => {
  if (lineListTotalsEtb.length === 0) {
    throw new Error("allocateToLines: lineListTotalsEtb must not be empty");
  }
  const target = parse(targetSubtotalEtb, "targetSubtotalEtb");
  if (target.isNegative()) {
    throw new Error(
      `allocateToLines: targetSubtotalEtb must not be negative: ${JSON.stringify(targetSubtotalEtb)}`,
    );
  }
  const listTotals = lineListTotalsEtb.map((value, index) => {
    const listTotal = parse(value, `lineListTotalsEtb[${index}]`);
    if (listTotal.isNegative()) {
      throw new Error(
        `allocateToLines: lineListTotalsEtb[${index}] must not be negative: ${JSON.stringify(value)}`,
      );
    }
    return listTotal;
  });

  // Whole cents throughout: integer arithmetic is what makes the
  // largest-remainder sum exact.
  const targetCents = target.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const listSum = listTotals.reduce((sum, v) => sum.plus(v), new Decimal(0));
  const allZero = listSum.isZero();
  const weights = allZero ? listTotals.map(() => new Decimal(1)) : listTotals;
  const weightSum = allZero ? new Decimal(listTotals.length) : listSum;

  const exact = weights.map((weight) => targetCents.mul(weight).div(weightSum));
  const floors = exact.map((share) => share.floor());
  const allocated = floors.reduce((sum, v) => sum.plus(v), new Decimal(0));
  const remainderCents = Math.max(0, targetCents.minus(allocated).toNumber());

  // Largest fractional remainder first; ties fall to the earlier line so the
  // allocation is deterministic for a given input order.
  const byRemainder = exact
    .map((share, index) => ({ index, frac: share.minus(floors[index]!) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.index - b.index);
  const getsExtraCent = new Set(
    byRemainder.slice(0, remainderCents).map((entry) => entry.index),
  );

  return floors.map((cents, index) =>
    money((getsExtraCent.has(index) ? cents.plus(1) : cents).div(100)),
  );
};

/**
 * The negotiated gap between what the pricing formula produced and what was
 * actually quoted — the thing the system currently cannot record. Their real
 * case: formula 8,521,500.00 incl VAT, quoted 7,835,000.00 -> 686,500.00 off,
 * 8.06%.
 *
 * A NEGATIVE amount is legitimate, not an error: it means the quote sits
 * above the calculated figure (a premium). Callers must not clamp it.
 */
export const computeDiscount = (
  calculatedTotalEtb: string,
  quotedTotalEtb: string,
): { discountAmountEtb: string; discountPercent: string } => {
  const calculatedRaw = parse(calculatedTotalEtb, "calculatedTotalEtb");
  const quotedRaw = parse(quotedTotalEtb, "quotedTotalEtb");
  if (calculatedRaw.isNegative()) {
    throw new Error(
      `computeDiscount: calculatedTotalEtb must not be negative: ${JSON.stringify(calculatedTotalEtb)}`,
    );
  }
  if (quotedRaw.isNegative()) {
    throw new Error(
      `computeDiscount: quotedTotalEtb must not be negative: ${JSON.stringify(quotedTotalEtb)}`,
    );
  }
  const calculated = calculatedRaw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const quoted = quotedRaw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const amount = calculated.minus(quoted);
  return {
    discountAmountEtb: amount.toFixed(2),
    // Nothing to be a percentage OF when the formula produced zero.
    discountPercent: calculated.isZero()
      ? "0.00"
      : money(amount.div(calculated).mul(100)),
  };
};
