import type { TenantBranding } from '../document-pdf.service';
import { FISCAL_NOTICE_TEXT } from './invoice.template';
import { buildReceiptHtml, type ReceiptTemplateData } from './receipt.template';

describe('buildReceiptHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const baseData: ReceiptTemplateData = {
    receiptNumber: 'RCT-FY2026-27-0001',
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    customerName: 'Acme Real Estate PLC',
    amountEtb: '112.00',
    method: 'BANK_TRANSFER',
    reference: 'TXN-998877',
    allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '112.00' }],
    hasOnAccount: false,
    onAccountEtb: '0.00',
    originalReceiptNumber: null,
  };

  it('titles the document PAYMENT RECEIPT and embeds the receipt number, customer, and amount', () => {
    const html = buildReceiptHtml(baseData, branding);
    expect(html).toContain('PAYMENT RECEIPT');
    expect(html).toContain('RCT-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('112.00 ETB');
  });

  it('renders the amount in words', () => {
    const html = buildReceiptHtml(baseData, branding);
    expect(html).toContain('One hundred twelve Birr and 00/100');
  });

  it('shows the allocations table mapping invoice number to amount applied', () => {
    const html = buildReceiptHtml(
      {
        ...baseData,
        allocations: [
          { invoiceNumber: 'INV-1', amountEtb: '60.00' },
          { invoiceNumber: 'INV-2', amountEtb: '40.00' },
        ],
      },
      branding,
    );
    expect(html).toContain('INV-1');
    expect(html).toContain('60.00 ETB');
    expect(html).toContain('INV-2');
    expect(html).toContain('40.00 ETB');
  });

  it('shows an "On account" row only when hasOnAccount is true', () => {
    const withoutRemainder = buildReceiptHtml(baseData, branding);
    expect(withoutRemainder).not.toContain('On account');

    const withRemainder = buildReceiptHtml(
      { ...baseData, hasOnAccount: true, onAccountEtb: '12.00' },
      branding,
    );
    expect(withRemainder).toContain('On account');
    expect(withRemainder).toContain('12.00 ETB');
  });

  it('always shows the compliance notice, never a fiscal mirror block — payments carry no fiscal columns', () => {
    const html = buildReceiptHtml(baseData, branding);
    expect(html).toContain(FISCAL_NOTICE_TEXT);
    expect(html).not.toContain('mirrored from the certified device');
  });

  it('prints REVERSAL OF RECEIPT <original> in the title and negative amounts when reversed', () => {
    const html = buildReceiptHtml(
      {
        ...baseData,
        receiptNumber: 'RCT-FY2026-27-0002',
        amountEtb: '-112.00',
        allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '-112.00' }],
        originalReceiptNumber: 'RCT-FY2026-27-0001',
      },
      branding,
    );
    expect(html).toContain('REVERSAL OF RECEIPT RCT-FY2026-27-0001');
    expect(html).toContain('-112.00 ETB');
    expect(html).toContain('Negative One hundred twelve Birr and 00/100');
  });

  it('escapes HTML in the customer name and invoice number', () => {
    const html = buildReceiptHtml(
      {
        ...baseData,
        customerName: '<script>alert(1)</script>',
        allocations: [{ invoiceNumber: '<b>x</b>', amountEtb: '112.00' }],
      },
      branding,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>x</b>');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildReceiptHtml(baseData, null);
    expect(html).toContain('#1B2A4A');
  });
});
