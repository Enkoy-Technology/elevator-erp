import { MONEY_RE, QUANTITY_RE, SIGNED_MONEY_RE } from './money';

/**
 * Pins the digit caps to their column precisions (numeric(14,2) money,
 * numeric(12,3) quantity) — see MONEY_RE/QUANTITY_RE's own doc comments for
 * why an unbounded pattern lets an oversized value reach Postgres and 500
 * instead of 400ing here. Only the boundary on each side matters: one digit
 * over the cap must be rejected by the DTO layer before it ever reaches SQL.
 */
describe('MONEY_RE — bounded to numeric(14, 2)', () => {
  it('accepts the largest representable value (12 integer digits, 2 decimals)', () => {
    expect(MONEY_RE.test('999999999999.99')).toBe(true);
  });

  it('rejects one integer digit past the cap', () => {
    expect(MONEY_RE.test('1000000000000.00')).toBe(false);
  });
});

describe('SIGNED_MONEY_RE — MONEY_RE plus an optional leading minus', () => {
  it('accepts a negative amount within the same digit cap', () => {
    expect(SIGNED_MONEY_RE.test('-999999999999.99')).toBe(true);
  });

  it('accepts a positive amount with no sign', () => {
    expect(SIGNED_MONEY_RE.test('500.00')).toBe(true);
  });

  it('rejects one integer digit past the cap even when negative', () => {
    expect(SIGNED_MONEY_RE.test('-1000000000000.00')).toBe(false);
  });

  it('rejects a double sign', () => {
    expect(SIGNED_MONEY_RE.test('--5.00')).toBe(false);
  });
});

describe('QUANTITY_RE — bounded to numeric(12, 3)', () => {
  it('accepts the largest representable value (9 integer digits, 3 decimals)', () => {
    expect(QUANTITY_RE.test('999999999.999')).toBe(true);
  });

  it('rejects one integer digit past the cap', () => {
    expect(QUANTITY_RE.test('1000000000.000')).toBe(false);
  });
});
