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
// smoke spec elsewhere. The invoice tests below (task 5.4) reuse the same
// launch for the same reason — one real Chromium spec file, not two.
import {
  quotationDocumentData,
  type QuotationDocumentRow,
} from '../../modules/quotations/quotation-document.mapper';
import { DocumentPdfService } from './document-pdf.service';
import type { TenantBranding } from './document-pdf.service';
import type { InvoiceTemplateData } from './templates/invoice.template';
import type { QuotationTemplateData } from './templates/quotation.template';

// Timeout for this suite (Puppeteer launch + render is slow) is set via
// jest.pdf-smoke.config.js's testTimeout, not jest.setTimeout here — the
// `jest` global isn't injected the same way under Jest's native-ESM mode.

describe('DocumentPdfService PDF smoke test (real Chromium)', () => {
  let service: DocumentPdfService;

  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#1B2A4A',
  };

  beforeAll(() => {
    service = new DocumentPdfService();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('renders the quotation template and preserves Amharic + money text', async () => {
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

  const invoiceBranding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#1B2A4A',
  };

  /** Shared base for the two invoice notice/mirror smoke cases below — only fiscal* fields differ. */
  const baseInvoiceData: InvoiceTemplateData = {
    invoiceNumber: 'INV-2026-SMOKE',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    dueDate: '2026-09-30',
    customerName: 'ኤሌቬተር ደንበኛ', // "elevator customer" in Amharic — task 5.4's required payload
    projectName: 'Smoke Test Tower',
    lines: [
      {
        description: 'Elevator unit',
        quantity: '1',
        unitPriceEtb: '1073537.30',
        lineTotalEtb: '1073537.30',
      },
    ],
    subtotalEtb: '1073537.30',
    taxPercent: '15.00',
    vatEtb: '161030.59',
    totalEtb: '1234567.89',
    hasWithholding: false,
    whtVoucherRef: null,
    whtDeductionEtb: '0.00',
    netCashDueEtb: '1234567.89',
    fiscalReceiptNumber: null,
  };

  it('renders the invoice template with an Amharic customer name and a large total, and shows NOT A FISCAL RECEIPT when the fiscal columns are null', async () => {
    const pdf = await service.renderDocumentPdf('invoice', baseInvoiceData, invoiceBranding);

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const parser = new PDFParse({ data: pdf });
    try {
      const { text } = await parser.getText();
      expect(text).toContain('ኤሌቬተር ደንበኛ');
      expect(text).toContain('1,234,567.89 ETB');
      expect(text).toContain('NOT A FISCAL RECEIPT');
      expect(text).not.toContain('mirrored from the certified device');
    } finally {
      await parser.destroy();
    }
  });

  it('replaces the notice with the fiscal mirror block once the fiscal columns are populated', async () => {
    const pdf = await service.renderDocumentPdf(
      'invoice',
      {
        ...baseInvoiceData,
        fiscalReceiptNumber: 'ETR-000123456',
        fiscalIssuedAt: new Date('2026-08-01T10:00:00.000Z'),
        fiscalDeviceSerial: 'SN-9988776655',
      },
      invoiceBranding,
    );

    const parser = new PDFParse({ data: pdf });
    try {
      const { text } = await parser.getText();
      expect(text).toContain('ኤሌቬተር ደንበኛ');
      expect(text).toContain('1,234,567.89 ETB');
      expect(text).not.toContain('NOT A FISCAL RECEIPT');
      expect(text).toContain('mirrored from the certified device');
      expect(text).toContain('ETR-000123456');
    } finally {
      await parser.destroy();
    }
  });

  /**
   * The quotation is a MULTI-PAGE document by design — page 1 commercial,
   * page 2 the 19-row specification, pages 3+ the tenant's boilerplate and
   * component table — so the page furniture has to survive pagination on
   * THIS template too, not only on a long invoice.
   *
   * It doubles as the arithmetic guard on the client's own numbers: their
   * proforma reads 7,835,000.00 grand total, 6,813,043.48 ex-VAT and
   * 1,021,956.52 VAT, and the ex-VAT line is printed as total - VAT so the
   * three always add up to the cent.
   */
  it("spans 3+ pages with the letterhead and footer on every one, and prints the client's figures exactly", async () => {
    const line = {
      sequence: 1,
      productType: 'PASSENGER',
      specSummary: '800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors',
      quantity: 1,
      unitPriceEtb: '6813043.48',
      lineTotalEtb: '6813043.48',
      machineRoomLabel: 'WITH MR',
      floorLabels: 'B,G,M,1,2,3,4,5,6,7,8,9,10',
      floorDisplaySummary: null,
      doorHeightMm: 2100,
      ropingRatio: '2:1',
      tractionMachineType: 'Gearless traction machine',
      controlSystem: 'Simplex',
      powerSupply: '380V AC 50HZ 3-phase 4 lines',
      lightSupply: '240V AC 50HZ Single phase',
      entranceCount: 1,
      calcInput: {
        capacityKg: 800,
        speedMs: 1.5,
        travelHeightM: 39,
        machineRoomType: 'MR',
        doorType: 'CENTER_OPEN',
        doorWidthMm: 900,
      },
      technicalSpec: {
        productType: 'PASSENGER',
        capacityPersons: 10,
        carWidthMm: 1400,
        carDepthMm: 1350,
        carHeightMm: 2300,
        shaftWidthMm: 1900,
        shaftDepthMm: 1750,
        pitDepthMm: 1600,
        overheadClearanceMm: 4500,
      },
    };
    const row: QuotationDocumentRow = {
      quoteNumber: 'QTN-2026-LONG',
      status: 'APPROVED',
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      validUntil: new Date('2026-08-25T00:00:00.000Z'),
      customerName: 'Rodas Real Estate PLC',
      projectName: 'Rodas Tower — Bole',
      technicalSpec: line.technicalSpec,
      pricingBreakdown: null,
      subtotalEtb: '6813043.48',
      marginPercent: '25.00',
      marginAmountEtb: '0.00',
      taxPercent: '15.00',
      taxAmountEtb: '1021956.52',
      totalPriceEtb: '7835000.00',
      notes: null,
      referenceCode: 'Rodas FUJIHD-E02',
      validityDays: 5,
      warrantyPartsMonths: 60,
      warrantyFreeServiceMonths: 12,
      deliveryDays: 150,
      lines: [line, { ...line, sequence: 2 }],
      paymentTerms: [
        { percent: '50.00', label: 'Payable upon signing of the contract', triggerEvent: 'SIGNING' },
        { percent: '30.00', label: 'Payable upon submission of shipping documents', triggerEvent: 'SHIPPING' },
        { percent: '10.00', label: 'Payable upon delivery to site', triggerEvent: 'DELIVERY' },
        { percent: '10.00', label: 'Payable after commissioning', triggerEvent: 'COMMISSIONING' },
      ],
    };
    const boilerplate = Array.from({ length: 6 }, (_unused, index) => ({
      title: `Standard section ${index + 1}`,
      body: 'Supply, delivery, erection, testing and commissioning of the elevators described in this offer.\nAll materials are new, unused and of the brands stated in the component specification table.',
    }));
    const components = Array.from({ length: 20 }, (_unused, index) => ({
      sequence: index + 1,
      componentName: `Component ${index + 1}`,
      brand: 'Montanari',
      remark: 'Italy',
    }));

    const pdf = await service.renderDocumentPdf(
      'quotation',
      quotationDocumentData(row, { boilerplate, components }),
      branding,
    );

    const parser = new PDFParse({ data: pdf });
    try {
      const { text, total } = await parser.getText();
      expect(total).toBeGreaterThanOrEqual(3);

      // The page furniture, once per page — not once per document.
      const letterheads = text.split('Enkoy Elevators PLC').length - 1;
      expect(letterheads).toBeGreaterThanOrEqual(total);
      expect(text).toContain(`1 / ${total}`);
      expect(text).toContain(`${total} / ${total}`);

      // The document title survives as ONE word: tracking above ~0.05em makes
      // Chromium write literal spaces into the text layer.
      expect(text).toContain('QUOTATION');
      // The slogan too. It is the most heavily tracked string in either
      // margin box (uppercased at 8.5px), so it is the first thing to
      // shatter into "L I F T I N G" if the ceiling is raised again — and
      // nothing used to assert it.
      expect(text).toContain('LIFTING ETHIOPIA');

      // The client's three figures, to the cent.
      expect(text).toContain('6,813,043.48 ETB');
      expect(text).toContain('1,021,956.52 ETB');
      expect(text).toContain('7,835,000.00 ETB');
      // ...and nothing about the negotiation behind them.
      expect(text).not.toContain('8,521,500.00');
      expect(text).not.toContain('686,500.00');

      // Page 2's specification table and the appendix both made it in.
      expect(text).toContain('Control System');
      // Section headings are uppercased by the stylesheet, and Chromium's
      // text layer records what was PRINTED, not the source string.
      expect(text).toContain('STANDARD SECTION 6');
      expect(text).toContain('Component 20');
    } finally {
      await parser.destroy();
    }
  });

  /**
   * The regression guard for the bug that prompted this design: the
   * letterhead and the footer used to be the first and last blocks of the
   * CONTENT flow, so on a short invoice the footer floated up under the
   * totals, and on a long one page 2 had no letterhead at all. They are now
   * drawn into Chromium's page margin boxes, which repeat on every page.
   *
   * Asserting on page COUNT and on the letterhead appearing once per page is
   * what actually catches a regression here — a screenshot of page 1 looks
   * identical either way.
   */
  it('repeats the letterhead and footer on every page of a long document', async () => {
    const lines = Array.from({ length: 70 }, (_unused, index) => ({
      description: `Line ${index + 1} — passenger elevator component, supply and install`,
      quantity: '1',
      unitPriceEtb: '12500.00',
      lineTotalEtb: '12500.00',
    }));

    const pdf = await service.renderDocumentPdf(
      'invoice',
      { ...baseInvoiceData, invoiceNumber: 'INV-2026-LONG', lines },
      invoiceBranding,
    );

    const parser = new PDFParse({ data: pdf });
    try {
      const { text, total } = await parser.getText();
      expect(total).toBeGreaterThan(1);

      // Once per page, not once per document.
      const letterheads = text.split('Enkoy Elevators PLC').length - 1;
      expect(letterheads).toBeGreaterThanOrEqual(total);

      // Chromium's own page counter, proving the footer band rendered.
      expect(text).toContain(`1 / ${total}`);
      expect(text).toContain(`${total} / ${total}`);
    } finally {
      await parser.destroy();
    }
  });
});
