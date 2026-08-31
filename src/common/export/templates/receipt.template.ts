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
 * Build the branded payment-receipt HTML document. Pure — no I/O. Always
 * carries the compliance notice (never the mirror block — payments have no
 * fiscal columns to populate; see invoice.template.ts's compliance doc
 * comment, rule 4): a payment receipt from the ERP is an acknowledgement of
 * funds received, never a substitute for the customer's own fiscal receipt.
 */
export const buildReceiptHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as ReceiptTemplateData;
  const isReversal = Boolean(d.originalReceiptNumber);
  const title = isReversal ? `REVERSAL OF RECEIPT ${d.originalReceiptNumber}` : 'PAYMENT RECEIPT';

  const allocRows = d.allocations
    .map(
      (a) =>
        `<tr><td>${esc(a.invoiceNumber)}</td><td class="num">${formatEtb(a.amountEtb)}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Receipt No.', value: d.receiptNumber },
    { label: 'Received', value: fmtDate(d.receivedAt) },
    { label: 'Method', value: d.reference ? `${d.method} (${d.reference})` : d.method },
  ])}

  ${renderParties(branding, { label: 'Received From', lines: [d.customerName] })}

  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr class="grand"><td>Amount</td><td class="num">${formatEtb(d.amountEtb)}</td></tr>
    </tbody>
  </table>
  </div>
  <div class="notes">${esc(amountWordsFor(d.amountEtb))}</div>

  <h2>Applied To</h2>
  <table class="lines">
    <thead><tr><th>Invoice</th><th class="num">Amount Applied</th></tr></thead>
    <tbody>
    ${allocRows || '<tr><td colspan="2">No invoices allocated</td></tr>'}
    ${d.hasOnAccount ? `<tr><td>On account</td><td class="num">${formatEtb(d.onAccountEtb)}</td></tr>` : ''}
    </tbody>
  </table>

  ${buildFiscalStatusHtml(undefined)}

  ${renderSignatureBlock(branding, 'Received by')}`;

  return renderLayout({
    branding,
    documentTitle: title,
    bodyHtml,
    footerNote: 'This is an acknowledgement of funds received, not a fiscal receipt. Prices in ETB.',
  });
};
