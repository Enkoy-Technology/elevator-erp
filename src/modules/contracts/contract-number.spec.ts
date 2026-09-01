import { buildContractNumber } from './contract-number';

describe('buildContractNumber', () => {
  it('renders CNT-{filename-safe fiscal year}-{4-digit sequence}', () => {
    expect(buildContractNumber('FY2026/27', 1)).toBe('CNT-FY2026-27-0001');
  });

  it('does not truncate a sequence past four digits', () => {
    expect(buildContractNumber('FY2026/27', 12345)).toBe('CNT-FY2026-27-12345');
  });
});
