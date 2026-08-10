import { computeLineTotal, sumLineTotals } from './invoice-money';

describe('computeLineTotal', () => {
  it('rounds HALF_UP to 2dp at the single multiplication point', () => {
    // Pinned reviewer counterexample from the brief: qty(12,3) x price(14,2)
    // -> round HALF_UP once at the line. 3.333 * 10.00 = 33.330 -> 33.33,
    // NOT 100.01 (which would only happen from a different, wrong grouping).
    expect(computeLineTotal('3.333', '10.00')).toBe('33.33');
  });

  it('rounds a true half-up case up', () => {
    // 1.005 * 1.00 = 1.005 -> HALF_UP -> 1.01 (not banker's rounding, which
    // would go to 1.00).
    expect(computeLineTotal('1.005', '1.00')).toBe('1.01');
  });

  it('handles whole-number quantity and price', () => {
    expect(computeLineTotal('2', '50.00')).toBe('100.00');
  });
});

describe('sumLineTotals', () => {
  it('sums already-rounded 2dp values exactly', () => {
    expect(sumLineTotals(['33.33', '100.00', '0.01'])).toBe('133.34');
  });

  it('returns 0.00 for an empty list', () => {
    expect(sumLineTotals([])).toBe('0.00');
  });
});
