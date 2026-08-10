import { buildProformaNumber } from './proforma-number';

describe('buildProformaNumber', () => {
  it('renders PF-{fiscalYearLabel with / as -}-{seq padded to 4 digits}', () => {
    expect(buildProformaNumber('FY2026/27', 1)).toBe('PF-FY2026-27-0001');
  });

  it('pads single and double digit sequences to 4 digits', () => {
    expect(buildProformaNumber('FY2026/27', 42)).toBe('PF-FY2026-27-0042');
  });

  it('does not truncate a sequence once it exceeds 4 digits', () => {
    expect(buildProformaNumber('FY2026/27', 12345)).toBe('PF-FY2026-27-12345');
  });
});
