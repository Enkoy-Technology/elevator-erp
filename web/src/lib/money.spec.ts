import { discountedEtb, discountPercentEtb } from './money';

describe('discountedEtb / discountPercentEtb', () => {
  it("prices a discount off the calculator's figure and reads it back", () => {
    expect(discountedEtb('7330000.00', '8')).toBe('6743600.00');
    expect(discountPercentEtb('7330000.00', '6743600.00')).toBe('8.00');
  });

  it("matches the client's own case: 7,835,000 off 8,521,500 is 8.06%", () => {
    expect(discountPercentEtb('8521500.00', '7835000.00')).toBe('8.06');
  });

  it('rounds to the cent and reads a premium as negative', () => {
    expect(discountedEtb('100.01', '33.33')).toBe('66.68');
    expect(discountPercentEtb('100.00', '110.00')).toBe('-10.00');
    expect(discountPercentEtb('0.00', '10.00')).toBe('0.00');
  });
});
