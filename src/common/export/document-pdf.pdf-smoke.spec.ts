/**
 * The load-bearing test of this pipeline: launches a real headless Chromium,
 * renders the quotation template with an Amharic (Ge'ez script) string, and
 * extracts text back out of the produced PDF bytes to prove the embedded
 * Noto Sans Ethiopic font actually round-trips — a standard PDF font has no
 * Ge'ez glyphs, so a regression here silently turns Amharic into tofu boxes.
 *
 * Deliberately kept in ONE spec file (Puppeteer launch is slow, ~seconds)
 * and, per the e2e DB-unreachable convention (test/e2e/tenant-isolation),
 * fails loudly rather than skipping silently if Chromium can't launch —
 * a green suite must mean this pipeline actually renders, not that it
 * quietly opted out.
 */
import { PDFParse } from 'pdf-parse';

// Deliberate exception to /common not depending on /modules: this test-only
// import lets the second `it` below exercise the real endpoint-level
// pipeline (a repository-shaped row -> quotationDocumentData -> the
// template), not just the template layer directly — reusing the one
// Chromium launch this suite already pays for, rather than adding a second
// smoke spec elsewhere.
import {
  quotationDocumentData,
  type QuotationDocumentRow,
} from '../../modules/quotations/quotation-document.mapper';
import { DocumentPdfService } from './document-pdf.service';
import type { TenantBranding } from './document-pdf.service';
import type { QuotationTemplateData } from './templates/quotation.template';

// Timeout for this suite (Puppeteer launch + render is slow) is set via
// jest.pdf-smoke.config.js's testTimeout, not jest.setTimeout here — the
// `jest` global isn't injected the same way under Jest's native-ESM mode.

describe('DocumentPdfService PDF smoke test (real Chromium)', () => {
  let service: DocumentPdfService;

  beforeAll(() => {
    service = new DocumentPdfService();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('renders the quotation template and preserves Amharic + money text', async () => {
    const branding: TenantBranding = {
      name: 'Enkoy Elevators PLC',
      slogan: 'Lifting Ethiopia',
      logoUrl: null,
      address: 'Bole Road, Addis Ababa',
      phones: ['+251 11 123 4567'],
      primaryColor: '#1B2A4A',
    };
    const data: QuotationTemplateData = {
      quoteNumber: 'QTN-2026-SMOKE',
      status: 'DRAFT',
      customerName: 'ኤሌቬተር ማንሻ', // "elevator lift" in Amharic — the PDF smoke payload
      projectName: 'Smoke Test Tower',
      totalPriceEtb: '143750.00',
      subtotalEtb: '100000.00',
      marginPercent: '25.00',
      marginAmountEtb: '25000.00',
      taxPercent: '15.00',
      taxAmountEtb: '18750.00',
    };

    let pdf: Buffer;
    try {
      pdf = await service.renderDocumentPdf('quotation', data, branding);
    } catch (err) {
      throw new Error(
        'PDF smoke test could not render via headless Chromium — Puppeteer likely ' +
          'failed to launch in this environment (missing shared libs, or the sandbox ' +
          'is blocked). This test fails loudly rather than skipping silently.',
        { cause: err },
      );
    }

    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const parser = new PDFParse({ data: pdf });
    try {
      const { text } = await parser.getText();
      expect(text).toContain('ኤሌቬተር ማንሻ');
      expect(text).toContain('143,750.00 ETB');
    } finally {
      await parser.destroy();
    }
  });

  it('renders via the endpoint-level path (repository row -> quotationDocumentData -> pdf) with an Amharic customer name', async () => {
    const branding: TenantBranding = {
      name: 'Enkoy Elevators PLC',
      slogan: 'Lifting Ethiopia',
      logoUrl: null,
      address: 'Bole Road, Addis Ababa',
      phones: ['+251 11 123 4567'],
      primaryColor: '#1B2A4A',
    };
    // Shaped like QuotationsRepository.findByIdForDocument's actual return
    // value — the real mapper input, not a hand-built QuotationTemplateData.
    const row: QuotationDocumentRow = {
      quoteNumber: 'QTN-2026-SMOKE2',
      status: 'APPROVED',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      validUntil: new Date('2026-09-30T00:00:00.000Z'),
      customerName: 'ኤሌቬተር ማንሻ',
      projectName: 'Smoke Test Tower',
      technicalSpec: null,
      pricingBreakdown: null,
      subtotalEtb: '100000.00',
      marginPercent: '25.00',
      marginAmountEtb: '25000.00',
      taxPercent: '15.00',
      taxAmountEtb: '18750.00',
      totalPriceEtb: '143750.00',
      notes: null,
    };

    const pdf = await service.renderDocumentPdf(
      'quotation',
      quotationDocumentData(row),
      branding,
    );

    const parser = new PDFParse({ data: pdf });
    try {
      const { text } = await parser.getText();
      expect(text).toContain('ኤሌቬተር ማንሻ');
      expect(text).toContain('143,750.00 ETB');
    } finally {
      await parser.destroy();
    }
  });
});
