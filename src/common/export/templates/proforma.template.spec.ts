import type { TenantBranding } from '../document-pdf.service';
import {
  buildProformaHtml,
  type ProformaTemplateData,
} from './proforma.template';

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
    preparedByName: 'Abebe Kebede',
  };

  it('titles the document PROFORMA INVOICE and embeds the proforma number, project, salesperson, and totals', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).toContain('PROFORMA INVOICE');
    expect(html).toContain('PF-FY2026-27-0001');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('Prepared by');
    expect(html).toContain('Abebe Kebede');
    expect(html).toContain('115,000.00 ETB');
  });

  it('never prints the customer name — the project and the salesperson name the document', () => {
    const html = buildProformaHtml(data, branding);
    expect(html).not.toContain('Acme Real Estate PLC');
  });

  it('omits the Prepared by line when nobody is recorded as the author', () => {
    const html = buildProformaHtml({ ...data, preparedByName: null }, branding);
    expect(html).not.toContain('Prepared by');
    expect(html).toContain('Bole Twin Towers');
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
    expect(html).toContain('<td>Total</td>');
    expect(html).toContain('100,000.00 ETB');
    expect(html).toContain('VAT (15.00%)');
    expect(html).toContain('<td>Grand Total</td>');
    expect(html).not.toContain('Margin');
    expect(html).not.toContain('Base equipment');
  });

  it('labels the plate as the client does, and never prints the workflow status', () => {
    const html = buildProformaHtml(
      { ...data, referenceCode: 'Rodas FUJIHD-E02' },
      branding,
    );
    expect(html).toContain('Proforma No.');
    expect(html).toContain('Reference code');
    expect(html).toContain('Date');
    expect(html).toContain('2026-08-01');
    expect(html).not.toContain('ISSUED');
    expect(html).not.toContain('Status');
  });

  it('escapes HTML in the project and salesperson names', () => {
    const html = buildProformaHtml(
      { ...data, projectName: '<b>x</b>', preparedByName: '<i>y</i>' },
      branding,
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<i>y</i>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;y&lt;/i&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildProformaHtml(data, null);
    expect(html).toContain('#1B2A4A');
  });
});
