import { buildInvoiceNumber } from './invoice-number';

describe('buildInvoiceNumber', () => {
  it('renders INV-{fiscalYearLabel with / as -}-{seq padded to 4}', () => {
    expect(buildInvoiceNumber('FY2026/27', 1)).toBe('INV-FY2026-27-0001');
    expect(buildInvoiceNumber('FY2026/27', 42)).toBe('INV-FY2026-27-0042');
    expect(buildInvoiceNumber('FY2026/27', 10000)).toBe('INV-FY2026-27-10000');
  });
});
