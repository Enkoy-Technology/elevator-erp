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
    marginPercent: '25.00',
    taxPercent: '15.00',
    subtotalEtb: '100000.00',
    marginAmountEtb: '25000.00',
    vatEtb: '18750.00',
    totalEtb: '143750.00',
    notes: 'Bank transfer only',
    technicalSpec: { capacityPersons: 13, motorPowerKw: '11.00' },
    pricingBreakdown: { baseCost: '80000.00', installationCost: '20000.00' },
    projectName: 'Bole Twin Towers — Lift A',
    customerName: 'Acme Real Estate PLC',
  };

  it('titles the document PROFORMA INVOICE and embeds the proforma number, names, and totals', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('PROFORMA INVOICE');
    expect(html).toContain('PF-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('143,750.00 ETB');
  });

  it('renders the branding letterhead', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('Enkoy Elevators PLC');
    expect(html).toContain('Bole Road, Addis Ababa');
  });

  it('reuses the quotation template pricing/technical rows', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('Base equipment');
    expect(html).toContain('Rated capacity');
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
