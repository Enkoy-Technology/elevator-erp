import { buildStatement, type StatementSourceRow } from './customer-statement';

const row = (partial: Partial<StatementSourceRow>): StatementSourceRow => ({
  id: 'id',
  kind: 'invoice',
  date: '2026-08-08',
  reference: 'REF',
  amountEtb: '0.00',
  ...partial,
});

describe('buildStatement — Task 3 (3.7)', () => {
  it('same-day invoice + payment: invoice sorts first (debit before credit) and the running balance reflects both', () => {
    const result = buildStatement({
      from: '2026-08-08',
      to: '2026-08-08',
      sourceRows: [
        // Deliberately inserted payment-first to prove sorting, not insertion order, decides the result.
        row({ id: 'pay-1', kind: 'payment', date: '2026-08-08', reference: 'RCT-1', amountEtb: '40.00' }),
        row({ id: 'inv-1', kind: 'invoice', date: '2026-08-08', reference: 'INV-1', amountEtb: '100.00' }),
      ],
    });

    expect(result.rows.map((r) => r.id)).toEqual(['inv-1', 'pay-1']);
    expect(result.rows[0]).toMatchObject({ debit: '100.00', credit: '0.00', balance: '100.00' });
    expect(result.rows[1]).toMatchObject({ debit: '0.00', credit: '40.00', balance: '60.00' });
    expect(result.openingBalance).toBe('0.00');
    expect(result.closingBalance).toBe('60.00');
  });

  it('same-day invoice + payment + withholding: kind order is invoice, payment, withholding', () => {
    const result = buildStatement({
      from: '2026-08-08',
      to: '2026-08-08',
      sourceRows: [
        row({ id: 'wht-1', kind: 'withholding', date: '2026-08-08', reference: 'WHT-1', amountEtb: '3.00' }),
        row({ id: 'pay-1', kind: 'payment', date: '2026-08-08', reference: 'RCT-1', amountEtb: '112.00' }),
        row({ id: 'inv-1', kind: 'invoice', date: '2026-08-08', reference: 'INV-1', amountEtb: '115.00' }),
      ],
    });

    expect(result.rows.map((r) => r.kind)).toEqual(['invoice', 'payment', 'withholding']);
    // Full settlement (payment + WHT covers the total) closes at zero — the
    // whole reason withholding is folded in as a credit row at all.
    expect(result.closingBalance).toBe('0.00');
  });

  it('a negative (reversal) payment amount adds back onto the balance', () => {
    const result = buildStatement({
      from: '2026-08-01',
      to: '2026-08-31',
      sourceRows: [
        row({ id: 'inv-1', kind: 'invoice', date: '2026-08-01', reference: 'INV-1', amountEtb: '100.00' }),
        row({ id: 'pay-1', kind: 'payment', date: '2026-08-05', reference: 'RCT-1', amountEtb: '100.00' }),
        row({ id: 'pay-2', kind: 'payment', date: '2026-08-06', reference: 'RCT-2', amountEtb: '-100.00' }),
      ],
    });

    expect(result.rows.map((r) => r.balance)).toEqual(['100.00', '0.00', '100.00']);
    expect(result.closingBalance).toBe('100.00');
  });

  it('rows strictly before `from` roll into openingBalance and are excluded from `rows`', () => {
    const result = buildStatement({
      from: '2026-08-10',
      to: '2026-08-31',
      sourceRows: [
        row({ id: 'inv-early', kind: 'invoice', date: '2026-08-01', amountEtb: '50.00' }),
        row({ id: 'inv-in-range', kind: 'invoice', date: '2026-08-15', amountEtb: '20.00' }),
      ],
    });

    expect(result.openingBalance).toBe('50.00');
    expect(result.rows.map((r) => r.id)).toEqual(['inv-in-range']);
    expect(result.closingBalance).toBe('70.00');
  });

  it('`from` and `to` are both inclusive boundaries', () => {
    const result = buildStatement({
      from: '2026-08-10',
      to: '2026-08-20',
      sourceRows: [
        row({ id: 'on-from', kind: 'invoice', date: '2026-08-10', amountEtb: '10.00' }),
        row({ id: 'on-to', kind: 'invoice', date: '2026-08-20', amountEtb: '10.00' }),
        row({ id: 'after-to', kind: 'invoice', date: '2026-08-21', amountEtb: '10.00' }),
      ],
    });

    expect(result.rows.map((r) => r.id)).toEqual(['on-from', 'on-to']);
    expect(result.closingBalance).toBe('20.00');
  });

  it('same day, same kind: id is the final deterministic tiebreaker', () => {
    const result = buildStatement({
      from: '2026-08-08',
      to: '2026-08-08',
      sourceRows: [
        row({ id: 'b', kind: 'invoice', date: '2026-08-08', amountEtb: '1.00' }),
        row({ id: 'a', kind: 'invoice', date: '2026-08-08', amountEtb: '1.00' }),
      ],
    });

    expect(result.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('no rows in range: closingBalance falls back to openingBalance', () => {
    const result = buildStatement({
      from: '2026-08-10',
      to: '2026-08-20',
      sourceRows: [row({ id: 'inv-early', kind: 'invoice', date: '2026-08-01', amountEtb: '15.00' })],
    });

    expect(result.rows).toEqual([]);
    expect(result.openingBalance).toBe('15.00');
    expect(result.closingBalance).toBe('15.00');
  });
});
