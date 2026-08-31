import type { TenantBranding } from '../document-pdf.service';
import { esc, renderLayout, renderReferencePlate } from './layout';
import { formatEtb } from './money-format';

export { formatEtb };

export interface CustomerStatementRow {
  date: string;
  kind: string;
  reference: string;
  debit: string;
  credit: string;
  balance: string;
}

/** Shape `DocumentPdfService.renderDocumentPdf('customer-statement', data, branding)` expects. */
export interface CustomerStatementTemplateData {
  customerName: string;
  from: string;
  to: string;
  openingBalance: string;
  closingBalance: string;
  rows: CustomerStatementRow[];
}

/**
 * Internal AR statement — an internal FINANCE artifact (see
 * aging.template.ts's own doc comment for why this carries none of
 * invoice.template.ts's compliance notice machinery). PDF only, no docx —
 * a statement is read, not edited.
 */
export const buildCustomerStatementHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as CustomerStatementTemplateData;

  const rows = d.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.kind)}</td>
        <td>${esc(r.reference)}</td>
        <td class="num">${formatEtb(r.debit)}</td>
        <td class="num">${formatEtb(r.credit)}</td>
        <td class="num">${formatEtb(r.balance)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Customer', value: d.customerName },
    { label: 'From', value: d.from },
    { label: 'To', value: d.to },
  ])}

  <div class="sum-block">
  <table class="totals">
    <tbody><tr><td>Opening Balance</td><td class="num">${formatEtb(d.openingBalance)}</td></tr></tbody>
  </table>
  </div>

  <h2>Account Activity</h2>
  <table class="lines compact">
    <thead>
      <tr><th>Date</th><th>Type</th><th>Reference</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">No activity in this period</td></tr>'}</tbody>
  </table>

  <div class="sum-block">
  <table class="totals">
    <tbody><tr class="grand"><td>Closing Balance</td><td class="num">${formatEtb(d.closingBalance)}</td></tr></tbody>
  </table>
  </div>`;

  return renderLayout({
    branding,
    documentTitle: 'CUSTOMER STATEMENT',
    bodyHtml,
    footerNote: 'Internal report. Prices in ETB.',
  });
};
