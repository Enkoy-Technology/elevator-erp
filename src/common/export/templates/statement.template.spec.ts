import type { TenantBranding } from '../document-pdf.service';
import { buildCustomerStatementHtml, type CustomerStatementTemplateData } from './statement.template';

describe('buildCustomerStatementHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const data: CustomerStatementTemplateData = {
    customerName: 'Acme Real Estate PLC',
    from: '2026-07-01',
    to: '2026-08-11',
    openingBalance: '0.00',
    closingBalance: '55000.00',
    rows: [
      { date: '2026-07-05', kind: 'invoice', reference: 'INV-1', debit: '115000.00', credit: '0.00', balance: '115000.00' },
      { date: '2026-07-20', kind: 'payment', reference: 'RCT-1', debit: '0.00', credit: '60000.00', balance: '55000.00' },
    ],
  };

  it('titles the document CUSTOMER STATEMENT and shows the customer, range, and opening/closing balances', () => {
    const html = buildCustomerStatementHtml(data, branding);
    expect(html).toContain('CUSTOMER STATEMENT');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('2026-08-11');
    expect(html).toContain('Opening Balance');
    expect(html).toContain('Closing Balance');
    expect(html).toContain('55,000.00 ETB');
  });

  it('shows each ledger row with its date, type, reference, debit/credit, and running balance', () => {
    const html = buildCustomerStatementHtml(data, branding);
    expect(html).toContain('INV-1');
    expect(html).toContain('115,000.00 ETB');
    expect(html).toContain('RCT-1');
    expect(html).toContain('60,000.00 ETB');
  });

  it('shows a placeholder row when there is no activity in the period', () => {
    const html = buildCustomerStatementHtml({ ...data, rows: [] }, branding);
    expect(html).toContain('No activity in this period');
  });

  it('escapes HTML in the customer name and reference', () => {
    const html = buildCustomerStatementHtml(
      {
        ...data,
        customerName: '<script>x</script>',
        rows: [{ ...data.rows[0]!, reference: '<b>y</b>' }],
      },
      branding,
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>y</b>');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildCustomerStatementHtml(data, null);
    expect(html).toContain('#1B2A4A');
  });
});
