// puppeteer is pure ESM (jest won't transform node_modules); stub it so this
// spec can exercise the service's non-Chromium logic without loading it.
// The real render path is covered by document-pdf.pdf-smoke.spec.ts.
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import { Test } from '@nestjs/testing';

import { TemplateNotImplementedError } from '../exceptions';
import { DocumentPdfService, isAllowedAssetUrl, type TenantBranding } from './document-pdf.service';

describe('isAllowedAssetUrl (SSRF guard)', () => {
  it('allows https to public hosts, about:blank, and data URIs', () => {
    expect(isAllowedAssetUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isAllowedAssetUrl('about:blank')).toBe(true);
    expect(isAllowedAssetUrl('data:image/png;base64,AAAA')).toBe(true);
  });

  it('blocks cloud metadata and private/loopback ranges', () => {
    expect(isAllowedAssetUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedAssetUrl('https://10.0.0.5/')).toBe(false);
    expect(isAllowedAssetUrl('https://192.168.1.1/')).toBe(false);
    expect(isAllowedAssetUrl('https://172.16.0.1/')).toBe(false);
    expect(isAllowedAssetUrl('https://127.0.0.1/')).toBe(false);
    expect(isAllowedAssetUrl('https://localhost/')).toBe(false);
  });

  it('blocks non-https schemes (file/http/blob)', () => {
    expect(isAllowedAssetUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedAssetUrl('http://169.254.169.254/')).toBe(false);
    expect(isAllowedAssetUrl('http://cdn.example.com/logo.png')).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isAllowedAssetUrl('not a url')).toBe(false);
  });

  // Regression coverage: a naive `/^fc|fd/`-style prefix regex over the raw
  // hostname string both false-positives on ordinary public hostnames and
  // misses IPv6 encodings of the same private ranges it means to block.
  it('does not false-positive on public hostnames that merely start like a blocked prefix', () => {
    expect(isAllowedAssetUrl('https://fcdn.io/logo.png')).toBe(true);
    expect(isAllowedAssetUrl('https://fdic.gov/logo.png')).toBe(true);
    expect(isAllowedAssetUrl('https://0.gravatar.com/avatar/x')).toBe(true);
  });

  it('blocks IPv6 encodings of private/loopback/link-local addresses', () => {
    // IPv4-mapped IPv6 for cloud metadata / loopback.
    expect(isAllowedAssetUrl('https://[::ffff:169.254.169.254]/')).toBe(false);
    expect(isAllowedAssetUrl('https://[::ffff:127.0.0.1]/')).toBe(false);
    // NAT64 well-known prefix encoding an IPv4 target.
    expect(isAllowedAssetUrl('https://[64:ff9b::a9fe:a9fe]/')).toBe(false);
    // Native IPv6 loopback / link-local / unique-local.
    expect(isAllowedAssetUrl('https://[::1]/')).toBe(false);
    expect(isAllowedAssetUrl('https://[fe80::1]/')).toBe(false);
    expect(isAllowedAssetUrl('https://[fc00::1]/')).toBe(false);
  });

  it('blocks carrier-grade NAT (RFC 6598, 100.64.0.0/10)', () => {
    expect(isAllowedAssetUrl('https://100.64.0.1/')).toBe(false);
    expect(isAllowedAssetUrl('https://100.100.100.200/')).toBe(false); // e.g. Alibaba Cloud metadata
  });
});

/** Wires a minimal mocked Puppeteer browser/page pair through the launch mock above. */
const mockLaunch = () => {
  const page = {
    setJavaScriptEnabled: jest.fn(),
    setRequestInterception: jest.fn(),
    on: jest.fn(),
    setContent: jest.fn().mockResolvedValue(undefined),
    // The renderer lifts the pinned header/footer bands out of the page's
    // <template> elements before calling pdf(); the real callback runs in
    // the browser, so here it just returns the shape that call produces.
    evaluate: jest.fn().mockResolvedValue({ head: '', foot: '' }),
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = {
    connected: true,
    newPage: jest.fn().mockResolvedValue(page),
    once: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const puppeteer = require('puppeteer').default as { launch: jest.Mock };
  puppeteer.launch.mockResolvedValue(browser);
  return { launch: puppeteer.launch, browser };
};

describe('DocumentPdfService.renderDocumentPdf', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  it('throws TemplateNotImplementedError for a template with no registered builder yet', async () => {
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf('contract', {}, branding),
    ).rejects.toBeInstanceOf(TemplateNotImplementedError);
    // Rejecting before touching Chromium: no browser launch attempted.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer').default as { launch: jest.Mock };
    expect(puppeteer.launch).not.toHaveBeenCalled();
  });

  it('names the rejected template in the error message', async () => {
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf('installation-certificate', {}, branding),
    ).rejects.toThrow(/installation-certificate/);
  });

  it('has a registered builder for "proforma" (Phase 3) — does not throw TemplateNotImplementedError', async () => {
    mockLaunch();
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf('proforma', {}, branding),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('has a registered builder for "invoice" (Phase 4) — does not throw TemplateNotImplementedError', async () => {
    mockLaunch();
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf(
        'invoice',
        {
          invoiceNumber: 'INV-1',
          status: 'ISSUED',
          customerName: 'Test',
          lines: [],
          subtotalEtb: '0.00',
          vatEtb: '0.00',
          totalEtb: '0.00',
          hasWithholding: false,
          whtDeductionEtb: '0.00',
          netCashDueEtb: '0.00',
        },
        branding,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('has a registered builder for "receipt" (Phase 4) — does not throw TemplateNotImplementedError', async () => {
    mockLaunch();
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf(
        'receipt',
        {
          receiptNumber: 'RCT-1',
          customerName: 'Test',
          amountEtb: '0.00',
          method: 'CASH',
          allocations: [],
          hasOnAccount: false,
          onAccountEtb: '0.00',
        },
        branding,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('has a registered builder for "aging-report" (Phase 4, task 5.3) — does not throw TemplateNotImplementedError', async () => {
    mockLaunch();
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf('aging-report', { asOfDate: '2026-08-11', rows: [] }, branding),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('has a registered builder for "customer-statement" (Phase 4, task 5.3) — does not throw TemplateNotImplementedError', async () => {
    mockLaunch();
    const service = new DocumentPdfService();
    await expect(
      service.renderDocumentPdf(
        'customer-statement',
        {
          customerName: 'Test',
          from: '2026-07-01',
          to: '2026-08-11',
          openingBalance: '0.00',
          closingBalance: '0.00',
          rows: [],
        },
        branding,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe('DocumentPdfService — single-flight browser launch', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: '',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: [],
    primaryColor: '#123456',
  };

  it('memoizes concurrent cold-start renders into a single Chromium launch', async () => {
    const { launch, browser } = mockLaunch();
    const service = new DocumentPdfService();

    await Promise.all([
      service.renderDocumentPdf('quotation', {}, branding),
      service.renderDocumentPdf('quotation', {}, branding),
    ]);

    expect(launch).toHaveBeenCalledTimes(1);
    expect(browser.newPage).toHaveBeenCalledTimes(2);
  });
});

describe('DocumentPdfService — onModuleDestroy actually registers via Nest', () => {
  // Regression: ExportModule existed but was never imported into AppModule
  // (or any feature module) before this task, so Nest's shutdown lifecycle
  // never reached DocumentPdfService.onModuleDestroy — a leaked Chromium
  // process on every app.close()/SIGTERM. Wiring QuotationsModule/
  // ProformasModule (and AppModule) to import ExportModule fixes that; this
  // proves the fix by actually closing a TestingModule and checking the
  // browser got closed, not by asserting on the wiring's source code.
  it('closes the launched browser when the Nest module is closed', async () => {
    const { browser } = mockLaunch();
    const moduleRef = await Test.createTestingModule({
      providers: [DocumentPdfService],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const service = app.get(DocumentPdfService);
    const branding: TenantBranding = {
      name: 'Enkoy Elevators PLC',
      slogan: '',
      logoUrl: null,
      address: '',
      phones: [],
      primaryColor: '#123456',
    };
    await service.renderDocumentPdf('quotation', {}, branding);
    expect(browser.close).not.toHaveBeenCalled();

    await app.close();

    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
