import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
// Type-only: erased at compile time, so this costs nothing at build time.
// The actual module is loaded with a dynamic `import()` in getBrowser()
// below — see the comment there for why (puppeteer is ESM-only).
import type { Browser } from 'puppeteer';

import { TemplateNotImplementedError } from '../exceptions';
import { buildAgingReportHtml } from './templates/aging.template';
import { buildCompletionCertificateHtml } from './templates/completion-certificate.template';
import { buildContractHtml } from './templates/contract.template';
import { buildInvoiceHtml } from './templates/invoice.template';
import { buildMaintenanceReportHtml } from './templates/maintenance-report.template';
import { buildPaymentScheduleHtml } from './templates/payment-schedule.template';
import { buildProformaHtml } from './templates/proforma.template';
import { buildQuotationHtml } from './templates/quotation.template';
import { buildReceiptHtml } from './templates/receipt.template';
import { buildCustomerStatementHtml } from './templates/statement.template';
import { buildTechnicalProposalHtml } from './templates/technical-proposal.template';
import { buildWarrantyCertificateHtml } from './templates/warranty-certificate.template';

/**
 * Every member here MUST have a builder in TEMPLATE_BUILDERS below. This
 * union previously declared four templates nobody had written — 'contract',
 * 'maintenance-report', 'warranty-certificate' and 'installation-certificate'
 * — so the type read as "built" while every call threw
 * TemplateNotImplementedError at runtime. The first three are now real; the
 * fourth is gone, because the installation module it belonged to is a
 * documented deferral and the client's proposal asks for a Completion
 * Certificate instead.
 */
export type DocumentTemplate =
  | 'quotation'
  | 'proforma'
  | 'invoice'
  | 'receipt'
  | 'contract'
  | 'payment-schedule'
  | 'technical-proposal'
  | 'maintenance-report'
  | 'warranty-certificate'
  | 'completion-certificate'
  | 'aging-report'
  | 'customer-statement';

export interface TenantBranding {
  name: string;
  slogan: string;
  logoUrl: string | null;
  address: string;
  phones: string[];
  primaryColor: string;
}

// Templates tolerate a null branding (a tenant that hasn't configured
// branding yet — the old code's `branding ?? null` scenario) even though
// renderDocumentPdf's own public signature below requires a non-null
// TenantBranding, matching the binding interface Phases 3/4 import.
type TemplateBuilder = (data: object, branding: TenantBranding | null) => string;

/**
 * 'quotation' (Phase 2), 'proforma' (Phase 3), 'invoice'/'receipt' (Phase 4,
 * task 5.1/5.2), and 'aging-report'/'customer-statement' (Phase 4, task 5.3)
 * are wired up. The rest of DocumentTemplate exists so later phases can
 * already type against it; requesting one of those throws
 * TemplateNotImplementedError until its phase lands — do not stub the
 * remaining templates ahead of the data that would fill them.
 */
// Record, not Partial<Record>: every union member above must have a builder,
// and the compiler now says so. That is the guard against a template being
// declared and never written again.
const TEMPLATE_BUILDERS: Record<DocumentTemplate, TemplateBuilder> = {
  quotation: buildQuotationHtml,
  proforma: buildProformaHtml,
  invoice: buildInvoiceHtml,
  receipt: buildReceiptHtml,
  contract: buildContractHtml,
  'payment-schedule': buildPaymentScheduleHtml,
  'technical-proposal': buildTechnicalProposalHtml,
  'maintenance-report': buildMaintenanceReportHtml,
  'warranty-certificate': buildWarrantyCertificateHtml,
  'completion-certificate': buildCompletionCertificateHtml,
  'aging-report': buildAgingReportHtml,
  'customer-statement': buildCustomerStatementHtml,
};

// Private/loopback/link-local IP ranges a tenant-controlled branding image
// URL could point Chromium at. `net.BlockList` (stdlib) does real CIDR
// matching on a parsed address, unlike a regex prefix-matched against the
// raw hostname string — a naive `/^fc|fd/` prefix check, tried earlier, both
// false-positives on ordinary public hostnames (e.g. "fcdn.io", "0.gravatar.com")
// and misses IPv6 encodings of these same private addresses entirely
// (IPv4-mapped `::ffff:169.254.169.254`, link-local `fe80::1`, NAT64
// `64:ff9b::a9fe:a9fe`) — a real SSRF bypass, since those are dialed as the
// embedded IPv4/link-local destination.
const PRIVATE_NETWORKS = new BlockList();
// IPv4: this-network, private (RFC 1918), carrier-grade NAT (RFC 6598),
// loopback, link-local (incl. cloud metadata 169.254.169.254).
PRIVATE_NETWORKS.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_NETWORKS.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_NETWORKS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_NETWORKS.addSubnet('192.168.0.0', 16, 'ipv4');
// IPv6: unspecified, loopback, link-local, unique-local (RFC 4193).
PRIVATE_NETWORKS.addSubnet('::', 128, 'ipv6');
PRIVATE_NETWORKS.addSubnet('::1', 128, 'ipv6');
PRIVATE_NETWORKS.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_NETWORKS.addSubnet('fc00::', 7, 'ipv6');
// IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) IPv6 encodings of an
// IPv4 address: block the whole prefix outright rather than re-checking the
// embedded v4 range — no legitimate branding asset URL is ever written this
// way, so there's no real false-positive cost.
PRIVATE_NETWORKS.addSubnet('::ffff:0:0', 96, 'ipv6');
PRIVATE_NETWORKS.addSubnet('64:ff9b::', 96, 'ipv6');

// ponytail: literal-IP/known-prefix match only — a hostname that DNS-resolves
// to a private IP still slips through (checked at request time, not fetch
// time). Full protection needs resolving the hostname before/instead of
// letting Chromium's own DNS lookup decide; upgrade if branding URLs ever
// accept arbitrary hostnames from lower-trust users.
const isPrivateHost = (hostname: string): boolean => {
  if (hostname.toLowerCase() === 'localhost') {
    return true;
  }
  const family = isIP(hostname);
  if (family === 0) {
    return false; // not an IP literal — nothing further to check statically
  }
  return PRIVATE_NETWORKS.check(hostname, family === 4 ? 'ipv4' : 'ipv6');
};

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
  return !isPrivateHost(url.hostname.replace(/^\[|\]$/g, ''));
};

@Injectable()
export class DocumentPdfService implements OnModuleDestroy {
  // ponytail: one shared browser, a fresh page per request, rendered
  // synchronously in the request. If PDF volume grows, move this to a
  // worker with a page pool.
  private browser: Browser | null = null;

  /**
   * Tail of the render queue. Renders run ONE AT A TIME.
   *
   * Chromium needs roughly a quarter of a gigabyte to lay out and print an
   * A4 document, on top of whatever the Nest process is already holding.
   * Measured in this project's own production image on Linux: one render
   * alongside 180MB of app fits in a 512MB container, three concurrent ones
   * do not — Chromium dies mid-print and the user gets
   * "Protocol error (Page.printToPDF): Printing failed".
   *
   * Two people clicking Download at the same moment is not an unusual event,
   * it is a Tuesday. Queueing makes the second one wait a second or two;
   * not queueing makes it fail. On a larger host the queue costs nothing,
   * because a render that has the memory it needs finishes immediately.
   *
   * Deliberately a promise chain rather than a semaphore library: the
   * concurrency limit here is one, and one is the case a chain expresses
   * exactly.
   */
  private renderQueue: Promise<unknown> = Promise.resolve();
  private launching: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (this.browser?.connected) {
      return Promise.resolve(this.browser);
    }
    // Memoize the launch *promise* so concurrent cold-start callers await the
    // same launch instead of each spawning (and leaking) a Chromium process.
    if (!this.launching) {
      // Default sandbox (no --no-sandbox): GitHub Actions' ubuntu-latest
      // runner (and any other non-root host) launches Chromium's sandbox
      // fine. --no-sandbox is only needed running as root in a container
      // (common in some Docker-based deploys) — add it there if that
      // environment ever hosts this service, rather than weakening the
      // sandbox everywhere by default.
      //
      // Dynamic `import()`: puppeteer (22+) ships ESM-only with no CJS
      // build. A static `import puppeteer from 'puppeteer'` would still
      // work at runtime (Node/webpack resolve it fine), but this project's
      // unit Jest project compiles everything to CommonJS, where a dynamic
      // import downlevels to `require()` anyway — so this line behaves
      // identically to a static import there, and unit specs mock the
      // 'puppeteer' module rather than relying on either form loading it
      // for real. The one spec that needs the real module (the PDF smoke
      // test) runs under a separate Jest project compiled to preserve a
      // genuine ESM dynamic import — see jest.pdf-smoke.config.js.
      this.launching = import('puppeteer')
        .then((mod) => mod.default.launch({ headless: true }))
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

  async renderDocumentPdf(
    templateName: DocumentTemplate,
    data: object,
    branding: TenantBranding,
  ): Promise<Buffer> {
    const builder = TEMPLATE_BUILDERS[templateName];
    if (!builder) {
      throw new TemplateNotImplementedError(templateName);
    }

    // Join the queue BEFORE building the HTML, so a burst of requests does
    // not all hold a document's worth of strings while they wait. The
    // `.catch` keeps one failed render from poisoning the queue for every
    // render after it — the failure still reaches its own caller.
    const run = this.renderQueue.then(() =>
      this.renderOne(builder, data, branding),
    );
    this.renderQueue = run.catch(() => undefined);
    return run;
  }

  private async renderOne(
    builder: TemplateBuilder,
    data: object,
    branding: TenantBranding,
  ): Promise<Buffer> {
    const html = builder(data, branding);

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // A rendered document is static — no script ever needs to run.
      // Disabling JS kills the code-execution surface entirely.
      await page.setJavaScriptEnabled(false);
      // Gate every subresource fetch: block file:/http:/private-IP targets so
      // tenant-controlled image URLs (branding.logoUrl) can't SSRF the host
      // or cloud metadata.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        // Puppeteer rejects continue()/abort() if the request/page is
        // already gone (e.g. the 15s timeout below fired mid-flight, or
        // page.close() ran while a subresource was still pending). An
        // unhandled rejection here would crash the whole process over one
        // tenant's slow/dead logo URL — swallow it, the render already has
        // its own timeout/error handling.
        if (isAllowedAssetUrl(req.url())) {
          req.continue().catch(() => {});
        } else {
          req.abort().catch(() => {});
        }
      });
      // 'load' fires after subresources (e.g. the branding logo) load. Hard
      // timeout so a slow/dead tenant image URL can't pin a page open on the
      // shared browser and starve other tenants' renders.
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      // Lift the two bands the layout parked in <template> elements and
      // hand them to Chromium as real page margin boxes. Templates get NO
      // page CSS and default to ~10px Times, so each is wrapped in one
      // inline-styled div; `width:100%` is required or Chromium renders
      // them at zero width and they silently vanish.
      // This callback is serialized and runs in the BROWSER, but it is
      // compiled against the API's Node lib, which has no DOM types — hence
      // the narrow structural cast rather than pulling "dom" into tsconfig
      // for one function.
      // Declare NO named function or helper in here. Only this callback's
      // source crosses into Chromium, so a bundler that keeps function names
      // (esbuild/swc, which `nest build --builder swc` and tsx both use)
      // rewrites a named binding to `__name(fn, '...')` and the render dies
      // in the browser with "__name is not defined". Repeating the
      // querySelector is the cost of the boundary.
      const bands = await page.evaluate(() => {
        const { document: doc } = globalThis as unknown as {
          document: { querySelector(selector: string): { innerHTML: string } | null };
        };
        return {
          head: doc.querySelector('#page-head')?.innerHTML ?? '',
          foot: doc.querySelector('#page-foot')?.innerHTML ?? '',
        };
      });

      const bandStyle =
        "width:100%;font-family:'Liberation Sans',Arial,sans-serif;font-size:8px;" +
        '-webkit-print-color-adjust:exact;print-color-adjust:exact;';

      const headerTemplate = bands.head
        ? `<div style="${bandStyle}padding:6mm 10mm 0;">${bands.head}</div>`
        : '<span></span>';
      // The page counter is Chromium's own — these class names are the
      // documented hook, not ours, and only work inside these templates.
      const footerTemplate = bands.foot
        ? `<div style="${bandStyle}padding:0 10mm 4mm;color:#57534e;">
             <div style="border-top:1px solid #d6cfc4;padding-top:2mm;display:flex;justify-content:space-between;gap:8mm;">
               <div style="flex:1;">${bands.foot}</div>
               <div style="white-space:nowrap;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>
             </div>
           </div>`
        : '<span></span>';

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        // The top/bottom margins RESERVE the band space on every page —
        // this is what stops page 2 sliding under the letterhead. They must
        // stay larger than the tallest band the templates can render, and
        // they must MATCH the @page rule in layout.ts, which otherwise wins
        // and reserves less space than the bands actually occupy.
        margin: { top: '34mm', bottom: '20mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      // A close failure (e.g. the target already crashed after the timeout
      // above) must not replace a real render error from the try block with
      // a confusing "failed to close" one — swallow it.
      await page.close().catch(() => {});
    }
  }

  async onModuleDestroy(): Promise<void> {
    // A cold launch may still be in flight (this.browser not yet set) when
    // shutdown happens — e.g. SIGTERM right after the first render request.
    // Await it too, or that Chromium process resolves after destroy and is
    // never closed.
    const browser = this.browser ?? (await this.launching?.catch(() => null));
    await browser?.close();
  }
}
