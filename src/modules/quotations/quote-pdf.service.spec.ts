// puppeteer is pure ESM (jest won't transform node_modules); stub it so this
// spec can import the pure isAllowedAssetUrl helper without loading Chromium.
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import { isAllowedAssetUrl } from './quote-pdf.service';

describe('isAllowedAssetUrl (SSRF guard)', () => {
  it('allows https to public hosts, about:blank, and data URIs', () => {
    expect(isAllowedAssetUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isAllowedAssetUrl('about:blank')).toBe(true);
    expect(isAllowedAssetUrl('data:image/png;base64,AAAA')).toBe(true);
  });

  it('blocks cloud metadata and private/loopback ranges', () => {
    expect(isAllowedAssetUrl('https://169.254.169.254/latest/meta-data/')).toBe(
      false,
    );
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
});
