import type { QuotationPdfContext } from './quotations.repository';

const etbFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a decimal money string (e.g. "1234.5") as "1,234.50 ETB". */
export const formatEtb = (value: string | null | undefined): string => {
  const n = Number(value ?? 0);
  return `${etbFormatter.format(Number.isFinite(n) ? n : 0)} ETB`;
};

const DEFAULT_PRIMARY = '#1B2A4A';
const DEFAULT_SECONDARY = '#E8B54D';

// escapeHtml is the wrong escaper for a CSS value: it stops `<style>` breakout
// but not `; { } url()`. Colours land inside a <style> block, so allow only a
// literal 3/6-digit hex and fall back to the brand default otherwise.
const sanitizeHex = (value: string | null | undefined, fallback: string): string =>
  value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtDate = (d: Date | null): string =>
  d ? new Date(d).toISOString().slice(0, 10) : '—';

const PRICING_ROWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'baseCost', label: 'Base equipment' },
  { key: 'stopCost', label: 'Additional stops' },
  { key: 'speedPremium', label: 'Speed premium' },
  { key: 'doorPremium', label: 'Door premium' },
  { key: 'installationCost', label: 'Installation' },
  { key: 'freightCost', label: 'Freight' },
];

const TECH_ROWS: ReadonlyArray<{ key: string; label: string; unit?: string }> = [
  { key: 'capacityPersons', label: 'Rated capacity', unit: 'persons' },
  { key: 'carWidthMm', label: 'Car width', unit: 'mm' },
  { key: 'carDepthMm', label: 'Car depth', unit: 'mm' },
  { key: 'shaftWidthMm', label: 'Shaft width', unit: 'mm' },
  { key: 'shaftDepthMm', label: 'Shaft depth', unit: 'mm' },
  { key: 'pitDepthMm', label: 'Pit depth', unit: 'mm' },
  { key: 'motorPowerKw', label: 'Motor power', unit: 'kW' },
  { key: 'guideRailSpec', label: 'Guide rail' },
];

/**
 * Build the branded quotation HTML document. Pure — no I/O — so it is unit
 * testable and Puppeteer just renders whatever string this returns.
 * `pdfHeaderHtml`/`pdfFooterHtml` are injected raw by design (tenant-owned
 * branding config); every other tenant/customer string is HTML-escaped.
 */
export const buildQuoteHtml = (ctx: QuotationPdfContext): string => {
  const { quote, projectName, customerName, branding } = ctx;
  const primary = sanitizeHex(branding?.primaryColorHex, DEFAULT_PRIMARY);
  const secondary = sanitizeHex(branding?.secondaryColorHex, DEFAULT_SECONDARY);
  const pricing = (quote.pricingBreakdown ?? {}) as Record<string, string>;
  const tech = (quote.technicalSpec ?? {}) as Record<string, unknown>;

  const header = branding?.pdfHeaderHtml
    ? branding.pdfHeaderHtml
    : `<div class="brand">
        ${branding?.logoUrl ? `<img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="logo" />` : ''}
        <div class="brand-meta">
          ${branding?.officialAddress ? `<div>${escapeHtml(branding.officialAddress)}</div>` : ''}
          ${branding?.contactEmail ? `<div>${escapeHtml(branding.contactEmail)}</div>` : ''}
          ${branding?.contactPhone ? `<div>${escapeHtml(branding.contactPhone)}</div>` : ''}
        </div>
      </div>`;

  const footer = branding?.pdfFooterHtml
    ? branding.pdfFooterHtml
    : `<div class="footer">
        ${branding?.stampUrl ? `<img class="stamp" src="${escapeHtml(branding.stampUrl)}" alt="stamp" />` : ''}
        <div class="fineprint">This quotation is valid until ${fmtDate(quote.validUntil)}. Prices in ETB.</div>
      </div>`;

  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null)
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${formatEtb(pricing[r.key])}</td></tr>`,
    )
    .join('');

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null)
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${escapeHtml(String(tech[r.key]))}${r.unit ? ` ${r.unit}` : ''}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { --primary: ${escapeHtml(primary)}; --secondary: ${escapeHtml(secondary)}; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 32px 40px; }
  .topbar { border-bottom: 3px solid var(--secondary); padding-bottom: 12px; margin-bottom: 20px; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { max-height: 56px; }
  .brand-meta { text-align: right; color: #555; font-size: 11px; line-height: 1.5; }
  .title-band { background: var(--primary); color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
  .title-band h1 { margin: 0; font-size: 20px; letter-spacing: 2px; }
  .badge { background: var(--secondary); color: var(--primary); padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 11px; }
  .meta-grid { display: flex; gap: 40px; margin: 18px 0; }
  .meta-grid .label { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  .meta-grid .value { font-size: 13px; font-weight: bold; }
  h2 { color: var(--primary); font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 14px; margin-left: auto; width: 55%; }
  .totals td { border: none; padding: 4px; }
  .totals .grand td { border-top: 2px solid var(--primary); font-size: 15px; font-weight: bold; color: var(--primary); padding-top: 8px; }
  .notes { margin-top: 18px; padding: 10px 12px; background: #f7f7f7; border-left: 3px solid var(--secondary); }
  .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .stamp { max-height: 80px; opacity: 0.9; }
  .fineprint { color: #888; font-size: 10px; }
</style>
</head>
<body>
  <div class="topbar">${header}</div>

  <div class="title-band">
    <h1>QUOTATION</h1>
    <span class="badge">${escapeHtml(quote.status)}</span>
  </div>

  <div class="meta-grid">
    <div><div class="label">Quote No.</div><div class="value">${escapeHtml(quote.quoteNumber)}</div></div>
    <div><div class="label">Issued</div><div class="value">${fmtDate(quote.createdAt)}</div></div>
    <div><div class="label">Valid Until</div><div class="value">${fmtDate(quote.validUntil)}</div></div>
  </div>

  <h2>Prepared For</h2>
  <div><strong>${escapeHtml(customerName)}</strong></div>
  <div>Project: ${escapeHtml(projectName)}</div>

  <h2>Technical Specification</h2>
  <table>${techRows || '<tr><td>See attached specification</td><td></td></tr>'}</table>

  <h2>Pricing</h2>
  <table>${pricingRows}</table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatEtb(quote.subtotalEtb)}</td></tr>
    <tr><td>Margin (${escapeHtml(quote.marginPercent)}%)</td><td class="num">${formatEtb(quote.marginAmountEtb)}</td></tr>
    <tr><td>Tax (${escapeHtml(quote.taxPercent)}%)</td><td class="num">${formatEtb(quote.taxAmountEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(quote.totalPriceEtb)}</td></tr>
  </table>

  ${quote.notes ? `<div class="notes">${escapeHtml(quote.notes)}</div>` : ''}

  ${footer}
</body>
</html>`;
};
