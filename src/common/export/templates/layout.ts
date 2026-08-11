import type { TenantBranding } from '../document-pdf.service';
import { ETHIOPIC_FONT_FACE_CSS } from './fonts';

const DEFAULT_PRIMARY = '#1B2A4A';

// Accepts unknown (not just string) so callers rendering a non-string field
// (e.g. a technicalSpec value that's a number or an arbitrary JSON leaf)
// don't each need their own `esc(String(x))` workaround — String(value) is
// the one coercion rule, applied here instead of at every call site.
export const esc = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// esc() is the wrong escaper for a CSS value: it stops `<style>` breakout
// but not `; { } url()`. primaryColor lands inside a <style> block, so allow
// only a literal 3/6-digit hex and fall back to the brand default otherwise.
//
// Always returns 6-digit form: a 3-digit value is valid CSS (harmless for
// the PDF path) but the docx renderer's TextRun `color` option validates
// against `docx`'s own hex parser, which rejects 3-digit shorthand outright
// (throws at Document-build time) — normalizing here, in the one shared
// sanitizer both renderers call, is cheaper than teaching the docx template
// its own color-shape rule.
export const sanitizeHex = (
  value: string | null | undefined,
  fallback: string = DEFAULT_PRIMARY,
): string => {
  if (!value || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
    return fallback;
  }
  if (value.length === 4) {
    const [r, g, b] = value.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return value;
};

export interface LayoutOptions {
  branding: TenantBranding | null;
  /** Document heading, e.g. "QUOTATION". Escaped internally. */
  documentTitle: string;
  /** Small pill next to the heading, e.g. a status. Escaped internally. */
  badge?: string;
  /** Pre-built, already-escaped HTML for the document body. */
  bodyHtml: string;
  /** Optional line under the branding footer, e.g. a validity notice. Escaped internally. */
  footerNote?: string;
}

/**
 * Shared letterhead shell: logo + tenant name/slogan header, address/phones
 * footer, primaryColor accents, and the embedded Ethiopic font so any
 * document that goes through this layout can render Amharic. Every template
 * builds its own `bodyHtml` and hands it here.
 */
export const renderLayout = (opts: LayoutOptions): string => {
  const { branding, documentTitle, badge, bodyHtml, footerNote } = opts;
  const primary = sanitizeHex(branding?.primaryColor);
  const phones = (branding?.phones ?? []).filter(Boolean).map(esc).join(' &middot; ');

  const headerHtml = `
    <div class="brand">
      ${branding?.logoUrl ? `<img class="logo" src="${esc(branding.logoUrl)}" alt="logo" />` : ''}
      <div class="brand-meta">
        <div class="brand-name">${esc(branding?.name ?? '')}</div>
        ${branding?.slogan ? `<div class="brand-slogan">${esc(branding.slogan)}</div>` : ''}
      </div>
    </div>`;

  const footerHtml = `
    <div class="footer">
      <div class="fineprint">
        ${branding?.address ? esc(branding.address) : ''}${phones ? ` &middot; ${phones}` : ''}
      </div>
      ${footerNote ? `<div class="fineprint">${esc(footerNote)}</div>` : ''}
    </div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${ETHIOPIC_FONT_FACE_CSS}
  :root { --primary: ${primary}; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, 'Noto Sans Ethiopic', sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 32px 40px; }
  .topbar { border-bottom: 3px solid var(--primary); padding-bottom: 12px; margin-bottom: 20px; }
  .brand { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .logo { max-height: 56px; }
  .brand-meta { text-align: right; }
  .brand-name { font-size: 16px; font-weight: bold; color: var(--primary); }
  .brand-slogan { color: #666; font-size: 11px; }
  .title-band { background: var(--primary); color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
  .title-band h1 { margin: 0; font-size: 20px; letter-spacing: 2px; }
  .badge { background: #fff; color: var(--primary); padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 11px; }
  .meta-grid { display: flex; gap: 40px; margin: 18px 0; }
  .meta-grid .label { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  .meta-grid .value { font-size: 13px; font-weight: bold; }
  h2 { color: var(--primary); font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 4px; border-bottom: 1px solid #eee; }
  th { text-align: left; border-bottom: 2px solid var(--primary); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 14px; margin-left: auto; width: 55%; }
  .totals td { border: none; padding: 4px; }
  .totals .grand td { border-top: 2px solid var(--primary); font-size: 15px; font-weight: bold; color: var(--primary); padding-top: 8px; }
  .notes { margin-top: 18px; padding: 10px 12px; background: #f7f7f7; border-left: 3px solid var(--primary); }
  /* Ethiopian-compliance notice/mirror block — see invoice.template.ts's own
     doc comment for the rule this renders (decisions doc §4). Prominent and
     in the layout's accent colour per that rule, not a quiet footnote. */
  .fiscal-notice { margin: 14px 0; padding: 10px 14px; border: 2px solid var(--primary); color: var(--primary); font-weight: bold; font-size: 12px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
  .fiscal-mirror { margin: 14px 0; padding: 10px 14px; border-left: 3px solid var(--primary); background: #f7f7f7; font-size: 11px; color: #333; line-height: 1.5; }
  .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; }
  .fineprint { color: #888; font-size: 10px; }
</style>
</head>
<body>
  <div class="topbar">${headerHtml}</div>

  <div class="title-band">
    <h1>${esc(documentTitle)}</h1>
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
  </div>

  ${bodyHtml}

  ${footerHtml}
</body>
</html>`;
};
