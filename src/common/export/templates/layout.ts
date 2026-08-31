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

/**
 * The branding fields the rendered documents actually use. Extends the
 * binding interface `TenantBranding` (document-pdf.service.ts, owned by the
 * renderer) with the two `tenant_branding` columns the documents need but
 * that interface doesn't name yet — `stamp_url` and `contact_email`.
 * Declared here, alongside the only code that reads them, so the template
 * layer can consume them without editing the renderer's public signature;
 * TenantBrandingProvider returns this wider shape and every caller that
 * only wants a TenantBranding still type-checks.
 */
export interface DocumentBranding extends TenantBranding {
  /** Scanned company seal. Rendered ONLY when set — never a placeholder box. */
  stampUrl?: string | null;
  email?: string | null;
}

// TenantBranding is structurally assignable to DocumentBranding (the extra
// fields are optional), so this is a widening annotation, not a cast.
const asDocumentBranding = (branding: TenantBranding | null): DocumentBranding | null => branding;

/** One cell of the reference plate: a mono label over a mono value. */
export interface ReferenceField {
  label: string;
  value: string;
}

/**
 * The document's identity block, set like an elevator load plate: ruled
 * cells, mono uppercase labels, mono values. This is the thing a person
 * quotes down the phone ("quote QTN-2026-ABCD1234"), so it is the one
 * element on the page that must be findable without reading anything else.
 * Every label and value is escaped here.
 */
export const renderReferencePlate = (fields: readonly ReferenceField[]): string => {
  if (fields.length === 0) {
    return '';
  }
  const width = (100 / fields.length).toFixed(4);
  const cells = fields
    .map(
      (f) =>
        `<td style="width:${width}%"><div class="plate-label">${esc(f.label)}</div><div class="plate-value">${esc(f.value)}</div></td>`,
    )
    .join('');
  return `<table class="plate"><tbody><tr>${cells}</tr></tbody></table>`;
};

/** One side of the from/to block. The first line renders bold (the party's name). */
export interface PartyBlock {
  label: string;
  lines: readonly string[];
}

/**
 * The two unambiguous party blocks every commercial document needs: who
 * issued it (always the tenant) and who it is addressed to. Escaped here.
 */
export const renderParties = (branding: TenantBranding | null, to: PartyBlock): string => {
  const from: PartyBlock = {
    label: 'From',
    lines: [branding?.name ?? '', ...(branding?.address ? [branding.address] : [])],
  };
  const column = (party: PartyBlock): string => {
    const lines = party.lines
      .filter(Boolean)
      .map((line, i) =>
        i === 0
          ? `<div class="party-name">${esc(line)}</div>`
          : `<div class="party-line">${esc(line)}</div>`,
      )
      .join('');
    return `<td><div class="plate-label">${esc(party.label)}</div>${lines}</td>`;
  };
  // A tenant with no name/address configured yet would otherwise leave an
  // empty ruled box where the sender belongs: drop the column instead.
  const fromHtml = from.lines.some(Boolean) ? column(from) : '';
  return `<table class="parties"><tbody><tr>${fromHtml}${column(to)}</tr></tbody></table>`;
};

/**
 * Signature and seal block for the customer-facing documents. The signature
 * rule always renders (it is document furniture, not branding); the seal
 * column renders only when the tenant has actually uploaded a stamp, so an
 * unset `stamp_url` leaves no broken image and no empty box behind.
 */
export const renderSignatureBlock = (
  branding: TenantBranding | null,
  caption = 'Authorized signature',
): string => {
  const b = asDocumentBranding(branding);
  const seal = b?.stampUrl
    ? `<td class="sign-seal"><img class="stamp" src="${esc(b.stampUrl)}" alt="" /><div class="sign-caption">Company seal</div></td>`
    : '';
  return `<table class="sign"><tbody><tr>
    <td class="sign-sign"><div class="sign-rule"></div><div class="sign-caption">${esc(caption)}</div>${b?.name ? `<div class="sign-caption">for ${esc(b.name)}</div>` : ''}</td>
    ${seal}
  </tr></tbody></table>`;
};

export interface LayoutOptions {
  branding: TenantBranding | null;
  /** Document heading, e.g. "QUOTATION". Escaped internally. */
  documentTitle: string;
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
 *
 * Colour rule: the tenant's primaryColor only ever appears as a rule, a
 * border, or a pale tint BEHIND near-black text — never as a text colour and
 * never as a solid band with white text on it. The client's own brand is
 * #FB9D19 (orange): white text on it reads at ~2.2:1 and coloured text of it
 * on white is worse, so the document is dark-on-light for every tenant and
 * the brand colour does the structural work instead. Tints are computed by
 * `color-mix()` in the renderer (no JS colour maths); every tint declaration
 * is preceded by a flat neutral so an older engine still gets a sane fill.
 */
export const renderLayout = (opts: LayoutOptions): string => {
  const { branding, documentTitle, bodyHtml, footerNote } = opts;
  const b = asDocumentBranding(branding);
  const primary = sanitizeHex(b?.primaryColor);
  const phones = (b?.phones ?? []).filter(Boolean).map(esc).join(' &middot; ');
  const contact = [b?.address ? esc(b.address) : '', phones, b?.email ? esc(b.email) : '']
    .filter(Boolean)
    .join(' &middot; ');

  // The two bands below are rendered by Chromium into the page MARGIN
  // BOXES, which are an isolated context with no access to this document's
  // stylesheet — a class name there resolves to nothing. So every rule the
  // letterhead needs is inlined here. Getting this wrong is not subtle: an
  // unconstrained logo expands to fill the page.
  //
  // alt="" (not alt="logo"): a logo URL the asset gate blocks, or one that
  // 404s, must leave nothing behind — not the word "logo" where the mark
  // should be.
  const headerHtml = `
    <table style="width:100%;border-collapse:collapse;"><tbody><tr>
      ${
        b?.logoUrl
          ? `<td style="width:1%;padding:0 12px 0 0;vertical-align:middle;border:none;"><img src="${esc(b.logoUrl)}" alt="" style="height:13mm;width:auto;display:block;" /></td>`
          : ''
      }
      <td style="padding:0 12px 0 0;vertical-align:middle;border:none;">
        <div style="font-size:13px;font-weight:bold;line-height:1.25;color:#17150f;">${esc(b?.name ?? '')}</div>
        ${b?.slogan ? `<div style="font-size:8.5px;letter-spacing:0.5px;text-transform:uppercase;color:#57534e;">${esc(b.slogan)}</div>` : ''}
      </td>
      <td style="width:1%;text-align:right;white-space:nowrap;vertical-align:middle;border:none;">
        <div style="font-size:17px;font-weight:bold;letter-spacing:1px;color:#17150f;">${esc(documentTitle)}</div>
      </td>
    </tr></tbody></table>
    <div style="height:2.5px;background:${primary};margin-top:5px;"></div>
    <div style="height:1px;background:#17150f;margin-top:1px;"></div>`;

  const footerHtml = `
      <div>${contact}</div>
      ${footerNote ? `<div>${esc(footerNote)}</div>` : ''}`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${ETHIOPIC_FONT_FACE_CSS}
  :root {
    --primary: ${primary};
    --ink: #14120e;
    --ink-soft: #5b554c;
    --rule: #d9d4cc;
    /* Flat neutral first, color-mix second: an engine without color-mix()
       keeps the neutral instead of dropping the fill entirely. */
    --tint: #f4f2ee;
    --tint: color-mix(in srgb, var(--primary) 9%, #ffffff);
    --tint-strong: #eae7e1;
    --tint-strong: color-mix(in srgb, var(--primary) 18%, #ffffff);
  }
  * { box-sizing: border-box; }

  /* These MUST match the margins DocumentPdfService passes to page.pdf().
     The comment that used to sit here claimed the renderer's margins win
     over @page — they do not; this rule won, which silently held the top
     margin at 14mm while the renderer reserved 34mm for the letterhead
     band, and the letterhead printed straight over the reference plate.
     The top and bottom values are the reserved page-furniture bands (see
     the <template> elements below); change them in both places or not at
     all. */
  @page { size: A4; margin: 34mm 10mm 20mm; }

  body {
    font-family: 'Liberation Sans', Arial, Helvetica, 'Noto Sans Ethiopic', sans-serif;
    color: var(--ink);
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
    padding: 0 5mm;
  }

  /* Page furniture, pinned.
     position:fixed in Chromium's print layout means "same place on every
     printed page" — which is what a letterhead and a footer are. Before
     this they were the first and last blocks of the content flow, so on a
     short invoice the footer floated up under the totals and sat halfway
     down an otherwise empty page.
     The band heights below are a contract with .page-body: it reserves
     exactly that much padding so content can never run under either band,
     and the bands are given the same height so a long address cannot grow
     into the page. Changing one without the other is what makes content
     overlap the letterhead, so they are declared together. */
  /* Chromium renders header/footer templates in an isolated context with
     NO access to this stylesheet, so everything those two bands need is
     inlined into them by the renderer. These rules only style the copies
     that live in the <template> elements, which are never displayed. */

  /* Only the FIGURES are monospaced, and only where digits are compared
     down a column or read out one at a time (a document number, a money
     column). Setting the whole label/caption/fineprint layer in a wide
     mono face is what made the document read as a terminal dump. */
  .mono, .plate-value, td.num, th.num {
    font-family: 'Liberation Mono', 'DejaVu Sans Mono', Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }

  /* ---- letterhead ------------------------------------------------- */
  .letterhead { width: 100%; border-collapse: collapse; }
  .letterhead td { vertical-align: top; padding: 0; border: none; }
  .lh-logo { width: 1%; padding-right: 14px; }
  .logo { max-height: 60px; max-width: 200px; }
  .lh-id { padding-right: 16px; }
  /* Tracking on every rule below is deliberately <= ~0.05em. Chromium's PDF
     text layer turns a wider inter-glyph gap into a literal space, which
     makes the document unsearchable and uncopyable — and the fiscal notice
     is a disclosure that has to be findable. Uppercase + weight + size
     carry the label treatment instead. The screen UI has no such ceiling.
     Guarded by document-pdf.pdf-smoke.spec.ts, which extracts real text. */
  .lh-name { font-size: 15px; line-height: 1.3; font-weight: bold; letter-spacing: 0.4px; }
  .lh-slogan { color: var(--ink-soft); font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  .lh-doc { width: 1%; text-align: right; white-space: nowrap; }
  .doc-title { font-size: 21px; line-height: 1.3; font-weight: bold; letter-spacing: 1px; }
  .head-rule { height: 3px; background: var(--primary); margin: 6px 0 0; }
  .head-rule-thin { height: 1px; background: var(--ink); margin: 1px 0 16px; }

  /* ---- reference plate (the load plate) --------------------------- */
  .plate {
    width: 100%; border-collapse: collapse;
    border: 1px solid var(--ink); border-top: 3px solid var(--primary);
    margin: 0 0 14px; page-break-inside: avoid;
  }
  .plate td {
    border: none; border-left: 1px solid var(--rule);
    padding: 7px 10px; vertical-align: top;
  }
  .plate td:first-child { border-left: none; }
  .plate-label {
    font-size: 8px; letter-spacing: 0.4px; text-transform: uppercase;
    color: var(--ink-soft); margin-bottom: 3px;
  }
  .plate-value { font-size: 12px; font-weight: bold; letter-spacing: 0.3px; }

  /* ---- party blocks ------------------------------------------------ */
  .parties { width: 100%; border-collapse: collapse; margin: 0 0 16px; page-break-inside: avoid; }
  .parties td {
    width: 50%; vertical-align: top; padding: 8px 10px;
    border: 1px solid var(--rule); background: #fcfbf9;
  }
  .party-name { font-size: 12px; font-weight: bold; }
  .party-line { color: var(--ink-soft); }

  /* ---- sections and tables ---------------------------------------- */
  h2 {
    font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase;
    color: var(--ink); margin: 18px 0 6px; padding-bottom: 3px;
    border-bottom: 2px solid var(--primary); page-break-after: avoid;
  }
  table { width: 100%; border-collapse: collapse; }
  .lines { page-break-inside: auto; }
  thead { display: table-header-group; }
  tr, td, th { page-break-inside: avoid; }
  td, th { padding: 5px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th {
    text-align: left; background: var(--tint); border-bottom: 1px solid var(--ink);
    font-size: 9px; letter-spacing: 0.4px; text-transform: uppercase;
  }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) td { background: #fbfaf8; }
  .compact td, .compact th { padding: 4px 5px; font-size: 9px; }

  /* ---- totals ------------------------------------------------------ */
  .sum-block { margin-top: 14px; page-break-inside: avoid; }
  .totals {
    margin-left: auto; width: 58%;
    border: 1px solid var(--ink); border-top: 3px solid var(--primary);
  }
  .totals td { border: none; border-bottom: 1px solid var(--rule); padding: 5px 10px; background: none; }
  .totals tr:last-child td { border-bottom: none; }
  .totals .grand td {
    background: var(--tint-strong); border-top: 1px solid var(--ink);
    font-size: 14px; font-weight: bold; color: var(--ink); padding: 8px 10px;
  }

  /* ---- notes, notices, signature ----------------------------------- */
  .notes { margin-top: 16px; padding: 8px 12px; background: var(--tint); border-left: 3px solid var(--primary); page-break-inside: avoid; }
  /* Ethiopian-compliance notice/mirror block — see invoice.template.ts's own
     doc comment for the rule this renders (decisions doc §4). Prominent and
     framed in the layout's accent colour per that rule, not a quiet footnote;
     the words themselves stay near-black so they are legible on any tenant
     brand colour. */
  .fiscal-notice { margin: 14px 0; padding: 9px 14px; border: 2px solid var(--primary); background: var(--tint); color: var(--ink); font-weight: bold; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 0.4px; page-break-inside: avoid; }
  .fiscal-mirror { margin: 14px 0; padding: 9px 14px; border-left: 3px solid var(--primary); background: var(--tint); font-size: 10px; color: var(--ink); line-height: 1.5; page-break-inside: avoid; }
  .sign { width: 100%; border-collapse: collapse; margin-top: 20px; page-break-inside: avoid; }
  .sign td { border: none; padding: 0 16px 0 0; vertical-align: bottom; background: none; }
  .sign-sign { width: 55%; }
  .sign-rule { border-bottom: 1px solid var(--ink); height: 28px; }
  .sign-caption { font-size: 9px; letter-spacing: 0; color: var(--ink-soft); margin-top: 4px; }
  .sign-seal { width: 45%; text-align: right; padding-right: 0; }
  .stamp { max-height: 90px; max-width: 160px; }

  /* ---- footer ------------------------------------------------------ */
  .fineprint { color: var(--ink-soft); font-size: 8.5px; line-height: 1.4; letter-spacing: 0; }
</style>
</head>
<body>
  <!-- The letterhead and the footer are PAGE FURNITURE, not content. They
       are parked in <template> elements that DocumentPdfService lifts out
       and passes to Chromium as headerTemplate/footerTemplate, which draws
       them into the page margin boxes on EVERY page and reserves the margin
       so body content can never run underneath.
       An earlier attempt used position:fixed instead. It looks right on a
       one-page invoice and is wrong the moment a document paginates: body
       padding reserves space once, at the top of the flow, so page 2's
       content slides straight under the letterhead. -->
  <template id="page-head">${headerHtml}</template>
  <template id="page-foot">${footerHtml}</template>

  ${bodyHtml}
</body>
</html>`;
};
