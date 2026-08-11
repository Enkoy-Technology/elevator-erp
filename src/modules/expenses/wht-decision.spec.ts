import { computeWithholding, selectWhtKind } from './wht-decision';

describe('selectWhtKind (brief 4.1 step 3)', () => {
  it('no TIN -> WHT_NO_TIN regardless of licence/supplyKind', () => {
    expect(
      selectWhtKind({ supplierTin: undefined, supplierLicenceOnFile: true, supplyKind: 'GOODS' }),
    ).toBe('WHT_NO_TIN');
  });

  it('TIN present but licence not on file -> WHT_NO_TIN', () => {
    expect(
      selectWhtKind({ supplierTin: '000123456', supplierLicenceOnFile: false, supplyKind: 'GOODS' }),
    ).toBe('WHT_NO_TIN');
  });

  it('TIN + licence, GOODS -> WHT_GOODS', () => {
    expect(
      selectWhtKind({ supplierTin: '000123456', supplierLicenceOnFile: true, supplyKind: 'GOODS' }),
    ).toBe('WHT_GOODS');
  });

  it('TIN + licence, SERVICES -> WHT_SERVICES', () => {
    expect(
      selectWhtKind({
        supplierTin: '000123456',
        supplierLicenceOnFile: true,
        supplyKind: 'SERVICES',
      }),
    ).toBe('WHT_SERVICES');
  });
});

describe('computeWithholding — full decision matrix (brief Tests section)', () => {
  it('WHT_NO_TIN: 30% regardless of amount, no threshold', () => {
    expect(computeWithholding('WHT_NO_TIN', '1.00', { percent: '30' })).toEqual({
      ratePercent: '30.00',
      whtEtb: '0.30',
    });
  });

  it('GOODS 19,999.99 (below threshold 20,000) -> 0%', () => {
    expect(
      computeWithholding('WHT_GOODS', '19999.99', { percent: '3', thresholdEtb: '20000' }),
    ).toEqual({ ratePercent: '0.00', whtEtb: '0.00' });
  });

  it('GOODS 20,000.00 (at threshold) -> 3%', () => {
    expect(
      computeWithholding('WHT_GOODS', '20000.00', { percent: '3', thresholdEtb: '20000' }),
    ).toEqual({ ratePercent: '3.00', whtEtb: '600.00' });
  });

  it('SERVICES 9,999.99 (below threshold 10,000) -> 0%', () => {
    expect(
      computeWithholding('WHT_SERVICES', '9999.99', { percent: '3', thresholdEtb: '10000' }),
    ).toEqual({ ratePercent: '0.00', whtEtb: '0.00' });
  });

  it('SERVICES 10,000.00 (at threshold) -> 3%', () => {
    expect(
      computeWithholding('WHT_SERVICES', '10000.00', { percent: '3', thresholdEtb: '10000' }),
    ).toEqual({ ratePercent: '3.00', whtEtb: '300.00' });
  });
});

describe('computeWithholding — R7: WHT_NO_TIN reads thresholdEtb from the payload like every other kind', () => {
  it('a 200 ETB no-TIN receipt still gets 30% withheld when the seeded payload carries no threshold — unchanged day-one behaviour, decisions doc §8.5 is still an open question', () => {
    expect(computeWithholding('WHT_NO_TIN', '200.00', { percent: '30' })).toEqual({
      ratePercent: '30.00',
      whtEtb: '60.00',
    });
  });

  it('a payload WITH a threshold suppresses withholding below it', () => {
    expect(
      computeWithholding('WHT_NO_TIN', '499.99', { percent: '30', thresholdEtb: '500' }),
    ).toEqual({ ratePercent: '0.00', whtEtb: '0.00' });
  });

  it('the same threshold applies withholding at/above it (inclusive)', () => {
    expect(
      computeWithholding('WHT_NO_TIN', '500.00', { percent: '30', thresholdEtb: '500' }),
    ).toEqual({ ratePercent: '30.00', whtEtb: '150.00' });
  });
});
