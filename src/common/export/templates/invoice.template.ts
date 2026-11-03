import type { TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
} from './layout';
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
 * THREE formats carry this document: PDF, DOCX, and XLSX. All three MUST
 * show the notice/mirror below — R6 found the xlsx export (invoices
 * controller's `?format=xlsx` on `:id/document`) shipping with NO fiscal
 * status at all, the one format most likely to be forwarded to an
 * accountant or inspector as "the invoice". XLSX has no HTML layout to sit
 * a `<div>` in, so it carries the PLAIN-TEXT equivalent
 * (`buildFiscalStatusText` below) in a leading "Document Status" column
 * instead — same notice/mirror decision, same source of truth
 * (FISCAL_NOTICE_TEXT), just not HTML. Do not add a fourth format without
 * giving it this same treatment.
 *
 * Rules enforced by buildFiscalStatusHtml/buildFiscalStatusText/
 * buildInvoiceHtml below — do not "simplify" any of these away:
 *
 *  1. Whenever `fiscalReceiptNumber` is null, this document MUST show the
 *     prominent notice INTERNAL DOCUMENT — NOT A FISCAL RECEIPT
 *     (FISCAL_NOTICE_TEXT), in the layout's accent colour (HTML formats) or
 *     as the leading column value (xlsx).
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
 *     so a receipt always renders the plain notice branch. (Payment
 *     receipts have no xlsx export at all — PaymentsController.document
 *     rejects ?format=xlsx outright — so buildFiscalStatusText has no
 *     receipt-side caller.)
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
 * The notice-or-mirror decision itself, in plain text, for every format:
 * null means the notice (FISCAL_NOTICE_TEXT) prints; otherwise these are
 * the mirror block's lines, always ending "mirrored from the certified
 * device". The PDF, the Word file and the xlsx cell all render this, so
 * none of them can decide differently.
 */
export const fiscalMirrorLines = (
  fiscal: FiscalMirrorFields | null | undefined,
): string[] | null =>
  fiscal?.fiscalReceiptNumber
    ? [
        `Fiscal receipt ${fiscal.fiscalReceiptNumber} issued ${fmtDate(fiscal.fiscalIssuedAt)} — device ${fiscal.fiscalDeviceSerial ?? '—'}`,
        ...(fiscal.fiscalKind ? [fiscal.fiscalKind] : []),
        ...(fiscal.fiscalNote ? [fiscal.fiscalNote] : []),
        'mirrored from the certified device',
      ]
    : null;

/**
 * Renders the notice (fiscalReceiptNumber null) or the mirror block
 * (populated) per the compliance rules above. `undefined`/`null` input is
 * the same as "no fiscal columns" — the notice branch — which is exactly
 * the case receipt.template.ts wants (payments have no fiscal columns to
 * ever populate).
 */
export const buildFiscalStatusHtml = (
  fiscal: FiscalMirrorFields | null | undefined,
): string => {
  const lines = fiscalMirrorLines(fiscal);
  return lines
    ? `<div class="fiscal-mirror">${lines.map(esc).join('<br/>')}</div>`
    : `<div class="fiscal-notice">${esc(FISCAL_NOTICE_TEXT)}</div>`;
};

/**
 * R6: the same notice-or-mirror decision as `buildFiscalStatusHtml`, as a
 * single plain-text cell value for the xlsx export (`INVOICE_DOCUMENT_COLUMNS`'s
 * leading "Document Status" column — see invoices.controller.ts's document
 * handler) — xlsx cells have no markup, so no `esc()`/no `<br/>`, just the
 * same words the HTML/DOCX formats show, joined with " — ".
 */
export const buildFiscalStatusText = (
  fiscal: FiscalMirrorFields | null | undefined,
): string => fiscalMirrorLines(fiscal)?.join(' — ') ?? FISCAL_NOTICE_TEXT;

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

/** One label/value row of a totals block, as both formats print it. */
export interface TotalLine {
  label: string;
  value: string;
}

/**
 * What the invoice prints, for both formats: buildInvoiceHtml and
 * buildInvoiceDocx read this one object, so the plate, the parties, the
 * items, the totals and the fine print cannot disagree between the PDF and
 * the Word file.
 */
export const invoiceBody = (d: InvoiceTemplateData) => ({
  documentTitle: 'INVOICE',
  plate: [
    { label: 'Invoice No.', value: d.invoiceNumber },
    { label: 'Issued', value: fmtDate(d.issuedAt) },
    { label: 'Due', value: fmtDate(d.dueDate) },
    { label: 'Status', value: d.status },
  ],
  billedTo: {
    label: 'Billed To',
    lines: [
      d.customerName,
      ...(d.projectName ? [`Project: ${d.projectName}`] : []),
    ],
  },
  /** Description, Qty, Unit Price, Line Total. */
  items: d.lines.map(
    (l) =>
      [
        l.description,
        l.quantity,
        formatEtb(l.unitPriceEtb),
        formatEtb(l.lineTotalEtb),
      ] as const,
  ),
  subtotal: {
    label: 'Subtotal',
    value: formatEtb(d.subtotalEtb),
  } satisfies TotalLine,
  vat: {
    label: `VAT (${d.taxPercent ?? '0'}%)`,
    value: formatEtb(d.vatEtb),
  } satisfies TotalLine,
  total: { label: 'Total', value: formatEtb(d.totalEtb) } satisfies TotalLine,
  /** The two rows a withholding adds, both after Total; null without one. */
  withholding: d.hasWithholding
    ? {
        deduction: {
          label: `Withholding retained by customer (voucher ${d.whtVoucherRef ?? '—'})`,
          value: formatEtb(d.whtDeductionEtb),
        } satisfies TotalLine,
        netCashDue: {
          label: 'Net cash due',
          value: formatEtb(d.netCashDueEtb),
        } satisfies TotalLine,
      }
    : null,
  footerNote: d.dueDate
    ? `Payment due by ${fmtDate(d.dueDate)}. Prices in ETB.`
    : 'Prices in ETB.',
});

/**
 * Build the branded invoice HTML document. Pure — no I/O. The compliance
 * notice/mirror block sits directly above the totals table ("above the
 * totals block" per §4) — deliberately NOT after Net cash due, so it is the
 * first thing a reader sees before any money figure.
 */
export const buildInvoiceHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as InvoiceTemplateData;
  const b = invoiceBody(d);
  const row = (t: TotalLine, grand = false) =>
    `<tr${grand ? ' class="grand"' : ''}><td>${esc(t.label)}</td><td class="num">${t.value}</td></tr>`;

  const lineRows = b.items
    .map(
      ([description, quantity, unit, total]) =>
        `<tr><td>${esc(description)}</td><td class="num">${esc(quantity)}</td><td class="num">${unit}</td><td class="num">${total}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  ${renderReferencePlate(b.plate)}

  ${renderParties(branding, b.billedTo)}

  <h2>Items</h2>
  <table class="lines">
    <thead>
      <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  ${buildFiscalStatusHtml(d)}

  <div class="sum-block">
  <table class="totals">
    <tbody>
    ${row(b.subtotal)}
    ${row(b.vat)}
    ${row(b.total, true)}
    ${
      b.withholding
        ? `${row(b.withholding.deduction)}
    ${row(b.withholding.netCashDue, true)}`
        : ''
    }
    </tbody>
  </table>
  </div>

  ${renderSignatureBlock(branding)}`;

  return renderLayout({
    branding,
    documentTitle: b.documentTitle,
    bodyHtml,
    footerNote: b.footerNote,
  });
};
