import { Decimal } from 'decimal.js';

import { splitVatExclusive, splitVatInclusive } from './expense-money';

describe('expense-money — VAT split, decimal.js HALF_UP 2dp (brief 4.1 step 2)', () => {
  describe('splitVatExclusive (net given, vat/gross derived)', () => {
    it('net 100.00 @15% -> vat 15.00, gross 115.00', () => {
      expect(splitVatExclusive('100.00', '15')).toEqual({
        netEtb: '100.00',
        vatEtb: '15.00',
        grossEtb: '115.00',
      });
    });

    it('net + vat === gross exactly', () => {
      const { netEtb, vatEtb, grossEtb } = splitVatExclusive('333.33', '15');
      expect(new Decimal(netEtb).plus(vatEtb).toFixed(2)).toBe(grossEtb);
    });
  });

  describe('splitVatInclusive (gross given, net/vat derived) — pinned rounding-residual convention', () => {
    it('gross 115.00 @15% -> net 100.00, vat 15.00 (brief example)', () => {
      expect(splitVatInclusive('115.00', '15')).toEqual({
        netEtb: '100.00',
        vatEtb: '15.00',
        grossEtb: '115.00',
      });
    });

    it('gross 100.00 @15% -> net 86.96, vat 13.04 (brief example — the non-exact division case)', () => {
      // 100 / 1.15 = 86.9565... rounds HALF_UP to 86.96. The residual cent
      // from that rounding lands on vat (100.00 - 86.96 = 13.04), never on
      // net — net is the only leg that goes through division/rounding here.
      expect(splitVatInclusive('100.00', '15')).toEqual({
        netEtb: '86.96',
        vatEtb: '13.04',
        grossEtb: '100.00',
      });
    });

    it('net + vat === gross exactly, for an amount that divides unevenly', () => {
      const { netEtb, vatEtb, grossEtb } = splitVatInclusive('333.33', '15');
      expect(new Decimal(netEtb).plus(vatEtb).toFixed(2)).toBe(grossEtb);
    });

  });

  it('HALF_UP tie-break: 2.50 @5% = 0.125 rounds to 0.13, not 0.12 (HALF_EVEN would give 0.12)', () => {
    expect(splitVatExclusive('2.50', '5')).toEqual({
      netEtb: '2.50',
      vatEtb: '0.13',
      grossEtb: '2.63',
    });
  });
});
