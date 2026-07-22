import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import puppeteer, { type Browser } from 'puppeteer';

import { buildQuoteHtml } from './quote-pdf.template';
import type { QuotationPdfContext } from './quotations.repository';

// Literal private / link-local / loopback hosts. Blocks the obvious SSRF
// targets (cloud metadata 169.254.169.254, internal ranges, localhost) that a
// tenant-controlled branding image URL could point Chromium at.
// ponytail: literal-IP match only — a hostname that DNS-resolves to a private
// IP still slips through. Full protection needs host resolution at fetch time;
// upgrade if branding URLs ever accept arbitrary hostnames from lower-trust users.
const PRIVATE_HOST =
  /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd|localhost$)/i;

/** Only https to a non-private host, or inline data: URIs, may be fetched. */
export const isAllowedAssetUrl = (raw: string): boolean => {
  if (raw === 'about:blank' || raw.startsWith('data:')) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false; // block file:, http:, blob:, ws:, etc.
  }
  return !PRIVATE_HOST.test(url.hostname.replace(/^\[|\]$/g, ''));
};

@Injectable()
export class QuotePdfService implements OnModuleDestroy {
  // ponytail: one shared browser, a fresh page per request, rendered
  // synchronously in the request. If PDF volume grows, move this to a BullMQ
  // worker with a page pool (the plan already flags queueing as a follow-up).
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (this.browser?.connected) {
      return Promise.resolve(this.browser);
    }
    // Memoize the launch *promise* so concurrent cold-start callers await the
    // same launch instead of each spawning (and leaking) a Chromium process.
    if (!this.launching) {
      this.launching = puppeteer
        .launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        })
        .then((browser) => {
          this.browser = browser;
          browser.once('disconnected', () => {
            this.browser = null;
            this.launching = null;
          });
          return browser;
        });
      // A failed launch must not wedge every future request on a rejected promise.
      this.launching.catch(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  async renderQuote(ctx: QuotationPdfContext): Promise<Buffer> {
    const html = buildQuoteHtml(ctx);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // A quotation is static — no script ever needs to run. Disabling JS kills
      // the code-execution surface from raw tenant pdfHeaderHtml/pdfFooterHtml.
      await page.setJavaScriptEnabled(false);
      // Gate every subresource fetch: block file:/http:/private-IP targets so
      // tenant-controlled image URLs can't SSRF the host or cloud metadata.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (isAllowedAssetUrl(req.url())) {
          void req.continue();
        } else {
          void req.abort();
        }
      });
      // 'load' fires after subresources (branding logo/stamp images) load.
      // Hard timeout so a slow/dead tenant image URL can't pin a page open on
      // the shared browser and starve other tenants' renders.
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
  }
}
