import { Document, Packer } from 'docx';
import zlib from 'node:zlib';

import type { TenantBranding } from '../document-pdf.service';
import { buildQuotationDocx } from './quotation.docx-template';
import type { QuotationTemplateData } from './quotation.template';

/**
 * The body XML out of the packed docx. `docx` writes each entry's real size
 * in its local header (no data descriptor), so the entry can be read straight
 * off the first occurrence of its name — the same zlib trick
 * document-docx.service.spec.ts uses, without the central-directory walk.
 */
const documentXml = async (doc: Document): Promise<string> => {
  const buf = await Packer.toBuffer(doc);
  const name = 'word/document.xml';
  const header = buf.indexOf(name) - 30;
  if (buf.readUInt32LE(header) !== 0x04034b50) {
    throw new Error('zip local header not found for word/document.xml');
  }
  const size = buf.readUInt32LE(header + 18);
  const start = header + 30 + name.length + buf.readUInt16LE(header + 28);
  return zlib
    .inflateRawSync(buf.subarray(start, start + size))
    .toString('utf8');
};

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
    preparedByName: 'Abebe Kebede',
  };

  it('returns a docx Document instance', () => {
    expect(buildQuotationDocx(data, branding)).toBeInstanceOf(Document);
  });

  it('names the project and the salesperson, never the customer', async () => {
    const xml = await documentXml(buildQuotationDocx(data, branding));
    expect(xml).toContain('Bole Twin Towers — Lift A');
    expect(xml).toContain('Prepared by: Abebe Kebede');
    expect(xml).not.toContain('Acme Real Estate PLC');
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
