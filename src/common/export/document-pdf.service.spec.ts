// puppeteer is pure ESM (jest won't transform node_modules); stub it so this
// spec can exercise the service's non-Chromium logic without loading it.
// The real render path is covered by document-pdf.pdf-smoke.spec.ts.
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

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
      service.renderDocumentPdf('invoice', {}, branding),
    ).rejects.toBeInstanceOf(TemplateNotImplementedError);
    // Rejecting before touching Chromium: no browser launch attempted.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer').default as { launch: jest.Mock };
    expect(puppeteer.launch).not.toHaveBeenCalled();
  });

  it('names the rejected template in the error message', async () => {
    const service = new DocumentPdfService();
    await expect(service.renderDocumentPdf('receipt', {}, branding)).rejects.toThrow(
      /receipt/,
    );
  });
});
