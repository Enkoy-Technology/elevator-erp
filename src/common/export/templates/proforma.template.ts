import type { TenantBranding } from '../document-pdf.service';
import { esc, renderLayout } from './layout';
import { formatEtb } from './money-format';
import { fmtDate, PRICING_ROWS, TECH_ROWS } from './quotation.template';

export { formatEtb, fmtDate };

/**
 * Shape `DocumentPdfService.renderDocumentPdf('proforma', data, branding)`
 * expects. Thin reuse of QuotationTemplateData's field set (same
 * PRICING_ROWS/TECH_ROWS/layout as quotation.template.ts) with the
 * proforma's own identifier (proformaNumber, issuedAt — no submit/approve
 * trail) and its own money column names (vatEtb/totalEtb, not the
 * quotation's taxAmountEtb/totalPriceEtb — see proformas schema / the
 * task-2 report). "the quotation's line data" (technicalSpec,
 * pricingBreakdown, marginPercent/marginAmountEtb, taxPercent) is carried
 * over from the quotation that was converted, since proformas do not
 * duplicate that jsonb snapshot — see proforma-document.mapper.ts.
 */
export interface ProformaTemplateData {
  proformaNumber: string;
  status: string;
  issuedAt?: Date | string | null;
  validUntil?: Date | string | null;
  customerName: string;
  projectName: string;
  technicalSpec?: Record<string, unknown> | null;
  pricingBreakdown?: Record<string, string> | null;
  subtotalEtb?: string | null;
  marginPercent?: string | null;
  marginAmountEtb?: string | null;
  taxPercent?: string | null;
  vatEtb?: string | null;
  totalEtb?: string | null;
  notes?: string | null;
}

/**
 * Build the branded proforma-invoice HTML document. Pure — no I/O — mirrors
 * buildQuotationHtml's body shape; only the title, the meta-grid's leading
 * field, and the totals block's field names differ.
 */
export const buildProformaHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as ProformaTemplateData;
  const pricing = d.pricingBreakdown ?? {};
  const tech = d.technicalSpec ?? {};

  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null)
    .map((r) => `<tr><td>${r.label}</td><td class="num">${formatEtb(pricing[r.key])}</td></tr>`)
    .join('');

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null)
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${esc(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  <div class="meta-grid">
    <div><div class="label">Proforma No.</div><div class="value">${esc(d.proformaNumber)}</div></div>
    <div><div class="label">Issued</div><div class="value">${esc(fmtDate(d.issuedAt))}</div></div>
    <div><div class="label">Valid Until</div><div class="value">${esc(fmtDate(d.validUntil))}</div></div>
  </div>

  <h2>Prepared For</h2>
  <div><strong>${esc(d.customerName)}</strong></div>
  <div>Project: ${esc(d.projectName)}</div>

  <h2>Technical Specification</h2>
  <table>${techRows || '<tr><td>See attached specification</td><td></td></tr>'}</table>

  <h2>Pricing</h2>
  <table>${pricingRows}</table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatEtb(d.subtotalEtb)}</td></tr>
    <tr><td>Margin (${esc(d.marginPercent ?? '0')}%)</td><td class="num">${formatEtb(d.marginAmountEtb)}</td></tr>
    <tr><td>VAT (${esc(d.taxPercent ?? '0')}%)</td><td class="num">${formatEtb(d.vatEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(d.totalEtb)}</td></tr>
  </table>

  ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}`;

  return renderLayout({
    branding,
    documentTitle: 'PROFORMA INVOICE',
    badge: d.status,
    bodyHtml,
    footerNote: `This proforma invoice is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
