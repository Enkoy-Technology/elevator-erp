import { discountNeedsSignOff } from './discount-sign-off';

describe('discountNeedsSignOff', () => {
  it('wants a sign-off for a discount above the threshold that nobody signed', () => {
    expect(discountNeedsSignOff('40.00', null, '10.00')).toBe(true);
  });

  it('is satisfied once someone signed it off', () => {
    expect(discountNeedsSignOff('40.00', 'gm-user-id', '10.00')).toBe(false);
  });

  it('lets a discount at or below the threshold through', () => {
    expect(discountNeedsSignOff('10.00', null, '10.00')).toBe(false);
    expect(discountNeedsSignOff('9.99', null, '10.00')).toBe(false);
  });

  it('never stops a premium (a negative discount)', () => {
    expect(discountNeedsSignOff('-3.50', null, '0.00')).toBe(false);
  });

  it('needs nothing when there is no discount or the tenant sets no threshold', () => {
    expect(discountNeedsSignOff(null, null, '10.00')).toBe(false);
    expect(discountNeedsSignOff('40.00', null, null)).toBe(false);
  });
});
