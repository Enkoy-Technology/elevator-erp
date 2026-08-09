import type { TenantBranding } from '../document-pdf.service';
import { buildQuotationHtml, type QuotationTemplateData } from './quotation.template';

// formatEtb() itself (grouping, null/''/garbage handling, and the
// PDF/docx-shared-formatter assertion) is covered in money-format.spec.ts —
// this file only needs to prove buildQuotationHtml actually calls it.

describe('buildQuotationHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567', '+251 91 234 5678'],
    primaryColor: '#123456',
  };

  const data: QuotationTemplateData = {
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'APPROVED',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    validUntil: new Date('2026-09-30T00:00:00.000Z'),
    marginPercent: '25.00',
    taxPercent: '15.00',
    subtotalEtb: '100000.00',
    marginAmountEtb: '25000.00',
    taxAmountEtb: '18750.00',
    totalPriceEtb: '143750.00',
    notes: 'Includes 12-month warranty',
    technicalSpec: { capacityPersons: 13, motorPowerKw: '11.00' },
    pricingBreakdown: { baseCost: '80000.00', installationCost: '20000.00' },
    projectName: 'Bole Twin Towers — Lift A',
    customerName: 'Acme Real Estate PLC',
  };

  it('embeds key quote fields, names, and totals', () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('QTN-2026-ABCD1234');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('143,750.00 ETB');
    expect(html).toContain('#123456'); // tenant primary colour drives the CSS
  });

  it('renders the branding letterhead (name, slogan, address, phones)', () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('Enkoy Elevators PLC');
    expect(html).toContain('Lifting Ethiopia');
    expect(html).toContain('Bole Road, Addis Ababa');
    expect(html).toContain('+251 11 123 4567');
    expect(html).toContain('+251 91 234 5678');
  });

  it('escapes HTML in tenant/customer/quotation-data strings to prevent injection', () => {
    const html = buildQuotationHtml(
      { ...data, customerName: '<b>x</b>' },
      branding,
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('escapes HTML in branding fields even though they are admin-set', () => {
    const html = buildQuotationHtml(data, {
      ...branding,
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildQuotationHtml(data, null);
    expect(html).toContain('#1B2A4A');
  });

  it('expands a 3-digit hex primary colour to 6 digits', () => {
    // sanitizeHex normalizes to 6-digit form for every caller (docx's own
    // color validator rejects 3-digit hex outright — see
    // quotation.docx-template.spec.ts's regression test for that renderer).
    // 3-digit hex was, and remains, valid CSS, so this is a display-only
    // change for the PDF path.
    const html = buildQuotationHtml(data, { ...branding, primaryColor: '#abc' });
    expect(html).toContain('#aabbcc');
    expect(html).not.toContain('--primary: #abc;');
  });

  it('rejects a CSS-injection payload in the primary colour', () => {
    const html = buildQuotationHtml(data, {
      ...branding,
      primaryColor: 'red; } body { background: url(http://evil/x)',
    });
    expect(html).not.toContain('url(http://evil');
    expect(html).toContain('#1B2A4A'); // fell back to default
  });
});
