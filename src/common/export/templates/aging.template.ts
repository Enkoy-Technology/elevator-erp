import type { TenantBranding } from '../document-pdf.service';
import { esc, renderLayout } from './layout';
import { formatEtb } from './money-format';

export { formatEtb };

export interface AgingReportRow {
  customerName: string | null;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}

/**
 * Shape `DocumentPdfService.renderDocumentPdf('aging-report', data, branding)`
 * expects. `asOfDate` is the business-calendar date (`todayIso()`, see
 * business-time.ts) the report was run against.
 */
export interface AgingReportTemplateData {
  asOfDate: string;
  rows: AgingReportRow[];
}

/**
 * Internal AR aging report — an internal FINANCE artifact, never handed to
 * a customer as a substitute for anything fiscal, so it carries none of
 * invoice.template.ts's compliance notice machinery (see that file's own
 * doc comment for why the invoice/receipt documents need it). PDF only —
 * this is a read report, not something anyone edits, so there is no docx
 * builder (see document-docx.service.ts's TEMPLATE_BUILDERS comment).
 */
export const buildAgingReportHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as AgingReportTemplateData;

  const rows = d.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.customerName ?? '—')}</td>
        <td class="num">${formatEtb(r.current)}</td>
        <td class="num">${formatEtb(r.d1_30)}</td>
        <td class="num">${formatEtb(r.d31_60)}</td>
        <td class="num">${formatEtb(r.d61_90)}</td>
        <td class="num">${formatEtb(r.d90_plus)}</td>
        <td class="num">${formatEtb(r.total)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
  <div class="meta-grid">
    <div><div class="label">As Of</div><div class="value">${esc(d.asOfDate)}</div></div>
  </div>

  <table>
    <tr><th>Customer</th><th class="num">Current</th><th class="num">1-30 Days</th><th class="num">31-60 Days</th><th class="num">61-90 Days</th><th class="num">90+ Days</th><th class="num">Total</th></tr>
    ${rows || '<tr><td colspan="7">No outstanding balances</td></tr>'}
  </table>`;

  return renderLayout({
    branding,
    documentTitle: 'AR AGING REPORT',
    bodyHtml,
    footerNote: 'Internal report — not for distribution to customers. Prices in ETB.',
  });
};
