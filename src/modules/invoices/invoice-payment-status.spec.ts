import { derivePaymentStatus } from './invoice-payment-status';

describe('derivePaymentStatus — Σ allocations + whtEtb vs totalEtb', () => {
  it('zero allocations, zero wht -> ISSUED', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '0.00',
        allocatedEtb: '0.00',
      }),
    ).toBe('ISSUED');
  });

  it('partial allocation, short of total -> PARTIALLY_PAID', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '0.00',
        allocatedEtb: '50.00',
      }),
    ).toBe('PARTIALLY_PAID');
  });

  it('allocations alone reach the total exactly -> PAID', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '0.00',
        allocatedEtb: '115.00',
      }),
    ).toBe('PAID');
  });

  it('allocations + wht together reach the total -> PAID, even though cash alone falls short', () => {
    // The decision this function exists to encode: the customer pays
    // totalEtb - whtEtb in cash; the retained wht is the rest.
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '15.00',
        allocatedEtb: '100.00',
      }),
    ).toBe('PAID');
  });

  it('allocations + wht just short of the total -> PARTIALLY_PAID, not PAID', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '15.00',
        allocatedEtb: '99.99',
      }),
    ).toBe('PARTIALLY_PAID');
  });

  it('allocations overshoot the total -> still PAID (no OVERPAID status exists)', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '115.00',
        whtEtb: '0.00',
        allocatedEtb: '120.00',
      }),
    ).toBe('PAID');
  });

  it('zero allocations but wht alone already covers the total -> PAID', () => {
    expect(
      derivePaymentStatus({
        totalEtb: '15.00',
        whtEtb: '15.00',
        allocatedEtb: '0.00',
      }),
    ).toBe('PAID');
  });
});
