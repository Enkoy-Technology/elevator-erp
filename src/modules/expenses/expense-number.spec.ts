import { buildExpenseNumber } from './expense-number';

describe('buildExpenseNumber', () => {
  it('renders EXP-{fiscalYearLabel with / as -}-{seq padded to 4}', () => {
    expect(buildExpenseNumber('FY2026/27', 1)).toBe('EXP-FY2026-27-0001');
    expect(buildExpenseNumber('FY2026/27', 42)).toBe('EXP-FY2026-27-0042');
    expect(buildExpenseNumber('FY2026/27', 10000)).toBe('EXP-FY2026-27-10000');
  });
});
