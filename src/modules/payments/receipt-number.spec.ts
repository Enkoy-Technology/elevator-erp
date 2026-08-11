import { buildReceiptNumber } from './receipt-number';

describe('buildReceiptNumber', () => {
  it('renders RCT-{fiscalYearLabel with / as -}-{seq padded to 4}', () => {
    expect(buildReceiptNumber('FY2026/27', 1)).toBe('RCT-FY2026-27-0001');
    expect(buildReceiptNumber('FY2026/27', 42)).toBe('RCT-FY2026-27-0042');
    expect(buildReceiptNumber('FY2026/27', 10000)).toBe('RCT-FY2026-27-10000');
  });
});
