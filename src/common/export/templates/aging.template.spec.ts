import type { TenantBranding } from '../document-pdf.service';
import { buildAgingReportHtml, type AgingReportTemplateData } from './aging.template';

describe('buildAgingReportHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const data: AgingReportTemplateData = {
    asOfDate: '2026-08-11',
    rows: [
      {
        customerName: 'Acme Real Estate PLC',
        current: '0.00',
        d1_30: '60000.00',
        d31_60: '0.00',
        d61_90: '0.00',
        d90_plus: '0.00',
        total: '60000.00',
      },
    ],
  };

  it('titles the document AR AGING REPORT and shows the as-of date and each customer bucket row', () => {
    const html = buildAgingReportHtml(data, branding);
    expect(html).toContain('AR AGING REPORT');
    expect(html).toContain('2026-08-11');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('60,000.00 ETB');
  });

  it('shows a placeholder row when there are no outstanding balances', () => {
    const html = buildAgingReportHtml({ ...data, rows: [] }, branding);
    expect(html).toContain('No outstanding balances');
  });

  it('escapes HTML in the customer name', () => {
    const html = buildAgingReportHtml(
      { ...data, rows: [{ ...data.rows[0]!, customerName: '<script>x</script>' }] },
      branding,
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildAgingReportHtml(data, null);
    expect(html).toContain('#1B2A4A');
  });
});
