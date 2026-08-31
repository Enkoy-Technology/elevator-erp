import type { TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
} from './layout';
import { formatEtb } from './money-format';
import { fmtDate, TECH_ROWS } from './quotation.template';

export { formatEtb, fmtDate };

/**
 * Shape `DocumentPdfService.renderDocumentPdf('proforma', data, branding)`
 * expects. Thin reuse of QuotationTemplateData's field set (same TECH_ROWS/
 * layout as quotation.template.ts) with the proforma's own identifier
 * (proformaNumber, issuedAt — no submit/approve trail) and its own money
 * column names (vatEtb/totalEtb, not the quotation's taxAmountEtb/
 * totalPriceEtb — see proformas schema / the task-2 report).
 *
 * Deliberately does NOT reuse quotation.template.ts's PRICING_ROWS/margin
 * fields: this document goes to the customer, and the quotation's
 * pre-margin cost itemization and margin amount are the client's markup —
 * never disclosed here (decision (a), finance-exports-sms phase-3 report).
 * The quotation template (internal artifact) keeps that breakdown; this one
 * shows only the taxable base, VAT, and total. taxPercent is not a stored
 * field — proforma-document.mapper.ts derives it from subtotalEtb/vatEtb.
 */
export interface ProformaTemplateData {
  proformaNumber: string;
  status: string;
  issuedAt?: Date | string | null;
  validUntil?: Date | string | null;
  customerName: string;
  projectName: string;
  technicalSpec?: Record<string, unknown> | null;
  subtotalEtb?: string | null;
  taxPercent?: string | null;
  vatEtb?: string | null;
  totalEtb?: string | null;
  notes?: string | null;
}

/**
 * Build the branded proforma-invoice HTML document. Pure — no I/O — mirrors
 * buildQuotationHtml's body shape; only the title, the reference plate's
 * leading field, and the pricing block (taxable base / VAT / total only — no
 * margin, no cost itemization, see the interface doc comment) differ.
 */
export const buildProformaHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as ProformaTemplateData;
  const tech = d.technicalSpec ?? {};

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null)
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${esc(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Proforma No.', value: d.proformaNumber },
    { label: 'Issued', value: fmtDate(d.issuedAt) },
    { label: 'Valid Until', value: fmtDate(d.validUntil) },
    { label: 'Status', value: d.status },
  ])}

  ${renderParties(branding, {
    label: 'Prepared For',
    lines: [d.customerName, `Project: ${d.projectName}`],
  })}

  <h2>Technical Specification</h2>
  <table class="lines">
    <thead><tr><th>Item</th><th class="num">Specification</th></tr></thead>
    <tbody>${techRows || '<tr><td>See attached specification</td><td class="num">&mdash;</td></tr>'}</tbody>
  </table>

  <h2>Pricing</h2>
  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr><td>Supply and installation</td><td class="num">${formatEtb(d.subtotalEtb)}</td></tr>
    <tr><td>VAT (${esc(d.taxPercent ?? '0')}%)</td><td class="num">${formatEtb(d.vatEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(d.totalEtb)}</td></tr>
    </tbody>
  </table>
  </div>

  ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}

  ${renderSignatureBlock(branding)}`;

  return renderLayout({
    branding,
    documentTitle: 'PROFORMA INVOICE',
    bodyHtml,
    footerNote: `This proforma invoice is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
