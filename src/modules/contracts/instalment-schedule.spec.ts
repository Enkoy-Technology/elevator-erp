import { scheduleMismatchReason, scheduleTotalEtb } from './instalment-schedule';

describe('scheduleTotalEtb', () => {
  it('sums to 2dp without float drift', () => {
    expect(
      scheduleTotalEtb([{ amountEtb: '0.10' }, { amountEtb: '0.20' }]),
    ).toBe('0.30');
  });

  it('is 0.00 for an empty schedule', () => {
    expect(scheduleTotalEtb([])).toBe('0.00');
  });
});

describe('scheduleMismatchReason', () => {
  // 20% advance / 70% on delivery / 10% retention — the case people expect
  // to be an exception, which in fact adds up to the contract value.
  const deposit = [
    { amountEtb: '200000.00' },
    { amountEtb: '700000.00' },
    { amountEtb: '100000.00' },
  ];

  it('accepts a deposit + retention split that totals the contract value', () => {
    expect(scheduleMismatchReason(deposit, '1000000.00')).toBeNull();
  });

  it('accepts an empty schedule (that is how one gets cleared)', () => {
    expect(scheduleMismatchReason([], '1000000.00')).toBeNull();
  });

  it('rejects a schedule that is one instalment short and names both totals', () => {
    const reason = scheduleMismatchReason(deposit.slice(0, 2), '1000000.00');
    expect(reason).toContain('900000.00');
    expect(reason).toContain('1000000.00');
  });

  it('rejects a one-cent mismatch — no tolerance', () => {
    expect(scheduleMismatchReason([{ amountEtb: '999999.99' }], '1000000.00')).not.toBeNull();
  });

  it('treats 1000 and 1000.00 as equal', () => {
    expect(scheduleMismatchReason([{ amountEtb: '1000' }], '1000.00')).toBeNull();
  });
});
