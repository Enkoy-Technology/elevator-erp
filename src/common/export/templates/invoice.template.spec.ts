import type { TenantBranding } from '../document-pdf.service';
import {
  buildFiscalStatusHtml,
  buildInvoiceHtml,
  FISCAL_NOTICE_TEXT,
  type InvoiceTemplateData,
} from './invoice.template';

describe('buildFiscalStatusHtml', () => {
  it('renders the compliance notice when fiscalReceiptNumber is null/undefined', () => {
    expect(buildFiscalStatusHtml(null)).toContain(FISCAL_NOTICE_TEXT);
    expect(buildFiscalStatusHtml(undefined)).toContain(FISCAL_NOTICE_TEXT);
    expect(buildFiscalStatusHtml({ fiscalReceiptNumber: null })).toContain(FISCAL_NOTICE_TEXT);
  });

  it('renders the mirror block — with "mirrored from the certified device" — once fiscalReceiptNumber is populated, and drops the notice', () => {
    const html = buildFiscalStatusHtml({
      fiscalReceiptNumber: 'ETR-000123456',
      fiscalIssuedAt: new Date('2026-08-01T00:00:00.000Z'),
      fiscalDeviceSerial: 'SN-9988776655',
      fiscalKind: 'Z-report',
      fiscalNote: 'Reconciled manually',
    });
    expect(html).toContain('ETR-000123456');
    expect(html).toContain('2026-08-01');
    expect(html).toContain('SN-9988776655');
    expect(html).toContain('Z-report');
    expect(html).toContain('Reconciled manually');
    expect(html).toContain('mirrored from the certified device');
    expect(html).not.toContain(FISCAL_NOTICE_TEXT);
  });

  it('never invents a fiscal artifact: no QR code markup, no fabricated numbers beyond what was passed in', () => {
    const html = buildFiscalStatusHtml({ fiscalReceiptNumber: 'ETR-1' });
    expect(html.toLowerCase()).not.toContain('qr');
  });
});

describe('buildInvoiceHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const baseData: InvoiceTemplateData = {
    invoiceNumber: 'INV-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    dueDate: '2026-09-30',
    customerName: 'Acme Real Estate PLC',
    projectName: 'Bole Twin Towers — Lift A',
    lines: [
      { description: 'Supply and installation', quantity: '1', unitPriceEtb: '100000.00', lineTotalEtb: '100000.00' },
    ],
    subtotalEtb: '100000.00',
    taxPercent: '15.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
    hasWithholding: false,
    whtVoucherRef: null,
    whtDeductionEtb: '0.00',
    netCashDueEtb: '115000.00',
    fiscalReceiptNumber: null,
  };

  it('titles the document INVOICE and embeds the invoice number, customer, and totals', () => {
    const html = buildInvoiceHtml(baseData, branding);
    expect(html).toContain('>INVOICE<');
    expect(html).toContain('INV-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('115,000.00 ETB');
  });

  it('itemizes every invoice_lines row — description, qty, unit price, line total', () => {
    const html = buildInvoiceHtml(
      {
        ...baseData,
        lines: [
          { description: 'Elevator unit', quantity: '1', unitPriceEtb: '80000.00', lineTotalEtb: '80000.00' },
          { description: 'Installation labour', quantity: '20.000', unitPriceEtb: '1000.00', lineTotalEtb: '20000.00' },
        ],
      },
      branding,
    );
    expect(html).toContain('Elevator unit');
    expect(html).toContain('Installation labour');
    expect(html).toContain('20.000');
    expect(html).toContain('80,000.00 ETB');
    expect(html).toContain('20,000.00 ETB');
  });

  it('shows the fiscal notice above the totals block when fiscalReceiptNumber is null', () => {
    const html = buildInvoiceHtml(baseData, branding);
    expect(html).toContain(FISCAL_NOTICE_TEXT);
    const noticeIndex = html.indexOf(FISCAL_NOTICE_TEXT);
    const totalsIndex = html.indexOf('class="totals"');
    expect(noticeIndex).toBeGreaterThan(-1);
    expect(totalsIndex).toBeGreaterThan(-1);
    expect(noticeIndex).toBeLessThan(totalsIndex);
  });

  it('shows the mirror block instead of the notice once fiscal columns are populated', () => {
    const html = buildInvoiceHtml(
      {
        ...baseData,
        fiscalReceiptNumber: 'ETR-000123456',
        fiscalIssuedAt: new Date('2026-08-01T00:00:00.000Z'),
        fiscalDeviceSerial: 'SN-9988776655',
      },
      branding,
    );
    expect(html).not.toContain(FISCAL_NOTICE_TEXT);
    expect(html).toContain('mirrored from the certified device');
  });

  it('does not show a withholding line or Net cash due when hasWithholding is false', () => {
    const html = buildInvoiceHtml(baseData, branding);
    expect(html).not.toContain('Withholding retained');
    expect(html).not.toContain('Net cash due');
  });

  it('shows the withholding deduction line and Net cash due only when hasWithholding is true', () => {
    const html = buildInvoiceHtml(
      {
        ...baseData,
        hasWithholding: true,
        whtVoucherRef: 'WHT-2026-000123',
        whtDeductionEtb: '-3450.00',
        netCashDueEtb: '111550.00',
      },
      branding,
    );
    expect(html).toContain('Withholding retained by customer (voucher WHT-2026-000123)');
    expect(html).toContain('-3,450.00 ETB');
    expect(html).toContain('Net cash due');
    expect(html).toContain('111,550.00 ETB');
  });

  it('escapes HTML in the customer name and line description', () => {
    const html = buildInvoiceHtml(
      {
        ...baseData,
        customerName: '<script>alert(1)</script>',
        lines: [{ description: '<b>x</b>', quantity: '1', unitPriceEtb: '1.00', lineTotalEtb: '1.00' }],
      },
      branding,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildInvoiceHtml(baseData, null);
    expect(html).toContain('#1B2A4A');
  });
});
