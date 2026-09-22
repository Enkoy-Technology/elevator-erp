import {
  instalmentsFromPercents,
  scheduleMismatchReason,
  scheduleTotalEtb,
} from './instalment-schedule';

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
    expect(
      scheduleMismatchReason([{ amountEtb: '999999.99' }], '1000000.00'),
    ).not.toBeNull();
  });

  it('treats 1000 and 1000.00 as equal', () => {
    expect(
      scheduleMismatchReason([{ amountEtb: '1000' }], '1000.00'),
    ).toBeNull();
  });
});

describe('instalmentsFromPercents', () => {
  it('turns a whole percentage schedule into cents that add up exactly', () => {
    const lines = instalmentsFromPercents(
      [
        { label: 'On signing', percent: '33.33' },
        { label: 'On delivery', percent: '33.33' },
        { label: 'On commissioning', percent: '33.34' },
      ],
      '1000000.00',
    );
    expect(lines).toEqual([
      { label: 'On signing', amountEtb: '333300.00' },
      { label: 'On delivery', amountEtb: '333300.00' },
      { label: 'On commissioning', amountEtb: '333400.00' },
    ]);
    expect(scheduleMismatchReason(lines!, '1000000.00')).toBeNull();
  });

  it('gives the largest row the rounding remainder, never a trailing 0% row', () => {
    const lines = instalmentsFromPercents(
      [
        { label: 'a', percent: '40.00' },
        { label: 'b', percent: '60.00' },
        { label: 'retention', percent: '0.00' },
      ],
      '100.01',
    );
    expect(lines!.map((l) => l.amountEtb)).toEqual(['40.00', '60.01', '0.00']);
  });

  it('is null for an empty or partial (deposit-only) schedule', () => {
    expect(instalmentsFromPercents([], '100.00')).toBeNull();
    expect(
      instalmentsFromPercents(
        [{ label: 'Deposit', percent: '30.00' }],
        '100.00',
      ),
    ).toBeNull();
  });
});
