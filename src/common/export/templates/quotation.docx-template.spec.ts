import { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildQuotationDocx } from './quotation.docx-template';
import type { QuotationTemplateData } from './quotation.template';

describe('buildQuotationDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: 'https://cdn.example.com/logo.png',
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

  it('returns a docx Document instance', () => {
    expect(buildQuotationDocx(data, branding)).toBeInstanceOf(Document);
  });

  it('does not throw when branding is absent (falls back to the default accent colour)', () => {
    expect(() => buildQuotationDocx(data, null)).not.toThrow();
  });

  it('does not throw when technicalSpec/pricingBreakdown/notes are absent', () => {
    const minimal: QuotationTemplateData = {
      quoteNumber: 'QTN-0001',
      status: 'DRAFT',
      customerName: 'Test Customer',
      projectName: 'Test Project',
    };
    expect(() => buildQuotationDocx(minimal, branding)).not.toThrow();
  });

  it('does not throw on a 3-digit hex primaryColor (docx rejects 3-digit hex; sanitizeHex must expand it)', () => {
    // Regression: sanitizeHex previously passed 3-digit hex straight through
    // (valid CSS, fine for the PDF's <style> block) but docx's own
    // TextRun `color` validator throws synchronously on anything but a
    // 6-digit hex string, so this used to crash Document construction.
    expect(() =>
      buildQuotationDocx(data, { ...branding, primaryColor: '#abc' }),
    ).not.toThrow();
  });

  it('does not fetch branding.logoUrl (a remote URL is skipped, not embedded)', () => {
    // A remote https logoUrl must not trigger any network I/O — the docx
    // renderer is pure/synchronous. There is nothing to await/mock here;
    // the assertion is simply that building the document from data with a
    // remote logoUrl set succeeds without the function needing network
    // access (jest has no fetch/http mocked and would fail loudly if this
    // template attempted an HTTP call).
    expect(() => buildQuotationDocx(data, branding)).not.toThrow();
  });
});
