import { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildProformaDocx } from './proforma.docx-template';
import type { ProformaTemplateData } from './proforma.template';

describe('buildProformaDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: 'https://cdn.example.com/logo.png',
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

  it('returns a docx Document instance', () => {
    expect(buildProformaDocx(data, branding)).toBeInstanceOf(Document);
  });

  it('does not throw when branding is absent', () => {
    expect(() => buildProformaDocx(data, null)).not.toThrow();
  });

  it('does not throw when technicalSpec/pricingBreakdown/notes are absent', () => {
    const minimal: ProformaTemplateData = {
      proformaNumber: 'PF-FY2026-27-0002',
      status: 'ISSUED',
      customerName: 'Test Customer',
      projectName: 'Test Project',
    };
    expect(() => buildProformaDocx(minimal, branding)).not.toThrow();
  });

  it('does not throw on a 3-digit hex primaryColor (same docx hex-validator regression as the quotation template)', () => {
    expect(() =>
      buildProformaDocx(data, { ...branding, primaryColor: '#abc' }),
    ).not.toThrow();
  });
});
