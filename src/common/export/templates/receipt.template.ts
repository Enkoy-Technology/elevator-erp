import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import { buildFiscalStatusHtml } from './invoice.template';
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

export interface ReceiptAllocationData {
  invoiceNumber: string;
  amountEtb: string;
}

/**
 * Shape `DocumentPdfService.renderDocumentPdf('receipt', data, branding)`
 * expects. `hasOnAccount`/`onAccountEtb` are precomputed by
 * receipt-document.mapper.ts (decimal.js) — this file stays pure string
 * formatting, no money arithmetic, matching invoice.template.ts.
 *
 * `originalReceiptNumber` set means this IS the reversing receipt (see
 * payments.ts's own doc comment on reversalOfPaymentId) — the title and
 * amounts follow from that, not a separate `isReversal` flag.
 */
export interface ReceiptTemplateData {
  receiptNumber: string;
  receivedAt?: Date | string | null;
  customerName: string;
  amountEtb: string;
  method: string;
  reference?: string | null;
  allocations: ReceiptAllocationData[];
  hasOnAccount: boolean;
  /** amountEtb minus Σ allocations, already signed — only rendered when hasOnAccount. */
  onAccountEtb: string;
  originalReceiptNumber?: string | null;
}

/** "Negative " + words for a negative amount (a reversal) — amountInWords itself is non-negative-only, see its own doc comment. */
const amountWordsFor = (amountEtb: string): string => {
  const trimmed = amountEtb.trim();
  const isNegative = trimmed.startsWith('-');
  const magnitude = isNegative ? trimmed.slice(1) : trimmed;
  const words = amountInWords(magnitude);
  return isNegative ? `Negative ${words}` : words;
};

/**
 * What the receipt prints, for both formats: buildReceiptHtml and
 * buildReceiptDocx read this one object, so the PDF and the Word file
 * cannot disagree.
 */
export const receiptBody = (d: ReceiptTemplateData) => ({
  documentTitle: d.originalReceiptNumber
    ? `REVERSAL OF RECEIPT ${d.originalReceiptNumber}`
    : 'PAYMENT RECEIPT',
  plate: [
    { label: 'Receipt No.', value: d.receiptNumber },
    { label: 'Received', value: fmtDate(d.receivedAt) },
    {
      label: 'Method',
      value: d.reference ? `${d.method} (${d.reference})` : d.method,
    },
  ],
  receivedFrom: { label: 'Received From', lines: [d.customerName] },
  amount: { label: 'Amount', value: formatEtb(d.amountEtb) },
  amountInWords: amountWordsFor(d.amountEtb),
  /** Invoice, Amount Applied. */
  allocations: d.allocations.map(
    (a) => [a.invoiceNumber, formatEtb(a.amountEtb)] as const,
  ),
  /** Printed across the table when nothing was allocated. */
  noAllocations: 'No invoices allocated',
  /** The unallocated remainder, after the allocations; null when there is none. */
  onAccount: d.hasOnAccount
    ? (['On account', formatEtb(d.onAccountEtb)] as const)
    : null,
  signatureCaption: 'Received by',
  footerNote:
    'This is an acknowledgement of funds received, not a fiscal receipt. Prices in ETB.',
});

/**
 * Build the branded payment-receipt HTML document. Pure — no I/O. Always
 * carries the compliance notice (never the mirror block — payments have no
 * fiscal columns to populate; see invoice.template.ts's compliance doc
 * comment, rule 4): a payment receipt from the ERP is an acknowledgement of
 * funds received, never a substitute for the customer's own fiscal receipt.
 */
export const buildReceiptHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as ReceiptTemplateData;
  const b = receiptBody(d);
  const appliedRow = ([label, value]: readonly [string, string]) =>
    `<tr><td>${esc(label)}</td><td class="num">${value}</td></tr>`;

  const bodyHtml = `
  ${renderReferencePlate(b.plate)}

  ${renderParties(branding, b.receivedFrom)}

  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr class="grand"><td>${esc(b.amount.label)}</td><td class="num">${b.amount.value}</td></tr>
    </tbody>
  </table>
  </div>
  <div class="notes">${esc(b.amountInWords)}</div>

  <h2>Applied To</h2>
  <table class="lines">
    <thead><tr><th>Invoice</th><th class="num">Amount Applied</th></tr></thead>
    <tbody>
    ${b.allocations.map(appliedRow).join('') || `<tr><td colspan="2">${esc(b.noAllocations)}</td></tr>`}
    ${b.onAccount ? appliedRow(b.onAccount) : ''}
    </tbody>
  </table>

  ${buildFiscalStatusHtml(undefined)}

  ${renderSignatureBlock(branding, b.signatureCaption)}`;

  return renderLayout({
    branding,
    documentTitle: b.documentTitle,
    bodyHtml,
    footerNote: b.footerNote,
  });
};
