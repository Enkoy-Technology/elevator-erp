import type { TenantBranding } from '../document-pdf.service';
import { buildProformaHtml, type ProformaTemplateData } from './proforma.template';

// formatEtb() itself is covered in money-format.spec.ts — see
// quotation.template.spec.ts's own note. This file only needs to prove
// buildProformaHtml actually wires the shared layout/rows correctly.

describe('buildProformaHtml', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const data: ProformaTemplateData = {
    proformaNumber: 'PF-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: new Date('2026-09-30T00:00:00.000Z'),
    taxPercent: '15.00',
    subtotalEtb: '100000.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
    notes: 'Bank transfer only',
    technicalSpec: { capacityPersons: 13, motorPowerKw: '11.00' },
    projectName: 'Bole Twin Towers — Lift A',
    customerName: 'Acme Real Estate PLC',
  };

  it('titles the document PROFORMA INVOICE and embeds the proforma number, names, and totals', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('PROFORMA INVOICE');
    expect(html).toContain('PF-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('115,000.00 ETB');
  });

  it('renders the branding letterhead', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('Enkoy Elevators PLC');
    expect(html).toContain('Bole Road, Addis Ababa');
  });

  it('prints the specification page from the stored snapshot even with no lines of its own', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('Specification');
    expect(html).toContain('Ordering quantity');
  });

  it('shows the taxable base, VAT and grand total — no margin row, no cost itemization', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('Total price');
    expect(html).toContain('100,000.00 ETB');
    expect(html).toContain('VAT (15.00%)');
    expect(html).toContain('Grand total');
    expect(html).not.toContain('Margin');
    expect(html).not.toContain('Base equipment');
  });

  it('escapes HTML in the customer name', () => {
    const html = buildProformaHtml({ ...data, customerName: '<b>x</b>' }, branding);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildProformaHtml(data, null);
    expect(html).toContain('#1B2A4A');
  });
});
