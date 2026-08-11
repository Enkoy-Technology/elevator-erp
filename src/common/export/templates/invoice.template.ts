import type { TenantBranding } from '../document-pdf.service';
import { esc, renderLayout } from './layout';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';

export { formatEtb, fmtDate };

/**
 * ============================================================================
 * COMPLIANCE — READ THIS BEFORE CHANGING ANYTHING IN THIS FILE.
 * See docs/planning/DECISIONS-platform-and-ethiopian-compliance.md §4.
 *
 * This ERP is a PARALLEL INTERNAL BOOK. It is not, and must never become,
 * the legal tax document. Ethiopia currently runs the ETR regime (nightly
 * Z-reports): the customer's certified sales-register device issues the
 * number that is legally binding, and `invoiceNumber` here is only an
 * internal reference. Shipping a document that could pass for a fiscal
 * receipt exposes the tenant to the ETB 50,000-per-invoice penalty under
 * VAT Proclamation 1341/2024 Art 52.
 *
 * Rules enforced by buildFiscalStatusHtml/buildInvoiceHtml below — do not
 * "simplify" any of these away:
 *
 *  1. Whenever `fiscalReceiptNumber` is null, this document MUST show the
 *     prominent notice INTERNAL DOCUMENT — NOT A FISCAL RECEIPT
 *     (FISCAL_NOTICE_TEXT), in the layout's accent colour.
 *  2. Once the five fiscal columns are populated (a human has re-keyed the
 *     customer's ETR/certified-device receipt onto invoices.fiscal* — see
 *     that table's own doc comment), the notice is REPLACED by a mirror
 *     block naming the fiscal receipt number, issue date and device serial,
 *     plus fiscalKind/fiscalNote when present. The mirror block always ends
 *     with the words "mirrored from the certified device" — never drop that
 *     phrase, it is what stops this block from being read as the ERP's own
 *     fiscal artifact.
 *  3. NEVER invent a fiscal artifact here: no QR code (not even one that
 *     looks decorative), no fabricated machine/serial number, no
 *     proclamation number (several are explicitly UNVERIFIED per the
 *     decisions doc §3 and must not be printed anywhere).
 *  4. receipt.template.ts follows the same notice logic and imports
 *     FISCAL_NOTICE_TEXT/buildFiscalStatusHtml from this file rather than
 *     re-deriving its own copy — payments carry no fiscal columns at all,
 *     so a receipt always renders the plain notice branch.
 * ============================================================================
 */

/** The exact notice text §4 requires — do not paraphrase it. */
export const FISCAL_NOTICE_TEXT = 'INTERNAL DOCUMENT — NOT A FISCAL RECEIPT';

/** The invoices.fiscal* columns (see invoices.ts) — the only inputs the notice-vs-mirror decision is allowed to look at. */
export interface FiscalMirrorFields {
  fiscalReceiptNumber?: string | null;
  fiscalIssuedAt?: Date | string | null;
  fiscalDeviceSerial?: string | null;
  fiscalKind?: string | null;
  fiscalNote?: string | null;
}

/**
 * Renders the notice (fiscalReceiptNumber null) or the mirror block
 * (populated) per the compliance rules above. `undefined`/`null` input is
 * the same as "no fiscal columns" — the notice branch — which is exactly
 * the case receipt.template.ts wants (payments have no fiscal columns to
 * ever populate).
 */
export const buildFiscalStatusHtml = (fiscal: FiscalMirrorFields | null | undefined): string => {
  if (!fiscal?.fiscalReceiptNumber) {
    return `<div class="fiscal-notice">${esc(FISCAL_NOTICE_TEXT)}</div>`;
  }
  const lines = [
    `Fiscal receipt ${esc(fiscal.fiscalReceiptNumber)} issued ${esc(fmtDate(fiscal.fiscalIssuedAt))} — device ${esc(fiscal.fiscalDeviceSerial ?? '—')}`,
    ...(fiscal.fiscalKind ? [esc(fiscal.fiscalKind)] : []),
    ...(fiscal.fiscalNote ? [esc(fiscal.fiscalNote)] : []),
    'mirrored from the certified device',
  ];
  return `<div class="fiscal-mirror">${lines.join('<br/>')}</div>`;
};

export interface InvoiceLineData {
  description: string;
  quantity: string;
  unitPriceEtb: string;
  lineTotalEtb: string;
}

/**
 * Shape `DocumentPdfService.renderDocumentPdf('invoice', data, branding)`
 * expects. Unlike proforma/quotation, this is the one document that
 * itemizes (invoice_lines) — Task 2 (standalone invoices, e.g. maintenance
 * billing) can produce genuinely multi-line invoices, so the customer needs
 * to see each line, not a single "Supply and installation" summary line.
 *
 * `hasWithholding`/`netCashDueEtb`/`whtDeductionEtb` are precomputed by
 * invoice-document.mapper.ts (decimal.js) rather than here — this file
 * stays pure string formatting, no money arithmetic, matching
 * quotation.template.ts/proforma.template.ts.
 */
export interface InvoiceTemplateData extends FiscalMirrorFields {
  invoiceNumber: string;
  status: string;
  issuedAt?: Date | string | null;
  dueDate?: string | null;
  customerName: string;
  projectName?: string | null;
  lines: InvoiceLineData[];
  subtotalEtb: string;
  taxPercent?: string | null;
  vatEtb: string;
  totalEtb: string;
  hasWithholding: boolean;
  whtVoucherRef?: string | null;
  /** Already negated (e.g. "-500.00") — ready for formatEtb, only rendered when hasWithholding. */
  whtDeductionEtb: string;
  /** totalEtb - whtEtb — only rendered when hasWithholding. */
  netCashDueEtb: string;
}

/**
 * Build the branded invoice HTML document. Pure — no I/O. The compliance
 * notice/mirror block sits directly above the totals table ("above the
 * totals block" per §4) — deliberately NOT after Net cash due, so it is the
 * first thing a reader sees before any money figure.
 */
export const buildInvoiceHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as InvoiceTemplateData;

  const lineRows = d.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}</td><td class="num">${esc(l.quantity)}</td><td class="num">${formatEtb(l.unitPriceEtb)}</td><td class="num">${formatEtb(l.lineTotalEtb)}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  <div class="meta-grid">
    <div><div class="label">Invoice No.</div><div class="value">${esc(d.invoiceNumber)}</div></div>
    <div><div class="label">Issued</div><div class="value">${esc(fmtDate(d.issuedAt))}</div></div>
    <div><div class="label">Due</div><div class="value">${esc(fmtDate(d.dueDate))}</div></div>
  </div>

  <h2>Billed To</h2>
  <div><strong>${esc(d.customerName)}</strong></div>
  ${d.projectName ? `<div>Project: ${esc(d.projectName)}</div>` : ''}

  <h2>Items</h2>
  <table>
    <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr>
    ${lineRows}
  </table>

  ${buildFiscalStatusHtml(d)}

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatEtb(d.subtotalEtb)}</td></tr>
    <tr><td>VAT (${esc(d.taxPercent ?? '0')}%)</td><td class="num">${formatEtb(d.vatEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(d.totalEtb)}</td></tr>
    ${
      d.hasWithholding
        ? `<tr><td>Withholding retained by customer (voucher ${esc(d.whtVoucherRef ?? '—')})</td><td class="num">${formatEtb(d.whtDeductionEtb)}</td></tr>
    <tr class="grand"><td>Net cash due</td><td class="num">${formatEtb(d.netCashDueEtb)}</td></tr>`
        : ''
    }
  </table>`;

  return renderLayout({
    branding,
    documentTitle: 'INVOICE',
    badge: d.status,
    bodyHtml,
    footerNote: d.dueDate ? `Payment due by ${fmtDate(d.dueDate)}. Prices in ETB.` : 'Prices in ETB.',
  });
};
