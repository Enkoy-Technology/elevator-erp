import type { TenantBranding } from '../document-pdf.service';
import { esc, renderLayout } from './layout';

const etbFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a decimal money string (e.g. "1234.5") as "1,234.50 ETB". */
export const formatEtb = (value: string | null | undefined): string => {
  const n = Number(value ?? 0);
  return `${etbFormatter.format(Number.isFinite(n) ? n : 0)} ETB`;
};

/** Exported for reuse by other renderers of the same template (e.g. the docx renderer). */
export const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) {
    return '—';
  }
  const parsed = d instanceof Date ? d : new Date(d);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toISOString().slice(0, 10);
};

/**
 * Shape `DocumentPdfService.renderDocumentPdf('quotation', data, branding)`
 * expects in `data`. The service's public signature takes `data: object` (a
 * shared binding across every template, per the export interface), so this
 * cast is the one place that shape gets asserted — Phase 3 (quotations) is
 * the caller responsible for actually supplying it.
 */
export interface QuotationTemplateData {
  quoteNumber: string;
  status: string;
  createdAt?: Date | string | null;
  validUntil?: Date | string | null;
  customerName: string;
  projectName: string;
  technicalSpec?: Record<string, unknown> | null;
  pricingBreakdown?: Record<string, string> | null;
  subtotalEtb?: string | null;
  marginPercent?: string | null;
  marginAmountEtb?: string | null;
  taxPercent?: string | null;
  taxAmountEtb?: string | null;
  totalPriceEtb?: string | null;
  notes?: string | null;
}

// Exported (alongside fmtDate above) so the docx renderer mirrors the same
// row set/labels as this PDF template instead of maintaining a second copy.
export const PRICING_ROWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'baseCost', label: 'Base equipment' },
  { key: 'stopCost', label: 'Additional stops' },
  { key: 'speedPremium', label: 'Speed premium' },
  { key: 'doorPremium', label: 'Door premium' },
  { key: 'installationCost', label: 'Installation' },
  { key: 'freightCost', label: 'Freight' },
];

export const TECH_ROWS: ReadonlyArray<{ key: string; label: string; unit?: string }> = [
  { key: 'capacityPersons', label: 'Rated capacity', unit: 'persons' },
  { key: 'carWidthMm', label: 'Car width', unit: 'mm' },
  { key: 'carDepthMm', label: 'Car depth', unit: 'mm' },
  { key: 'shaftWidthMm', label: 'Shaft width', unit: 'mm' },
  { key: 'shaftDepthMm', label: 'Shaft depth', unit: 'mm' },
  { key: 'pitDepthMm', label: 'Pit depth', unit: 'mm' },
  { key: 'motorPowerKw', label: 'Motor power', unit: 'kW' },
  { key: 'guideRailSpec', label: 'Guide rail' },
];

/**
 * Build the branded quotation HTML document. Pure — no I/O — so it is unit
 * testable and Puppeteer just renders whatever string this returns. Every
 * interpolated data/branding field is HTML-escaped.
 */
export const buildQuotationHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as QuotationTemplateData;
  const pricing = d.pricingBreakdown ?? {};
  const tech = d.technicalSpec ?? {};

  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null)
    .map((r) => `<tr><td>${r.label}</td><td class="num">${formatEtb(pricing[r.key])}</td></tr>`)
    .join('');

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null)
    .map(
      (r) =>
        `<tr><td>${r.label}</td><td class="num">${esc(String(tech[r.key]))}${r.unit ? ` ${r.unit}` : ''}</td></tr>`,
    )
    .join('');

  const bodyHtml = `
  <div class="meta-grid">
    <div><div class="label">Quote No.</div><div class="value">${esc(d.quoteNumber)}</div></div>
    <div><div class="label">Issued</div><div class="value">${esc(fmtDate(d.createdAt))}</div></div>
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
    <tr><td>Tax (${esc(d.taxPercent ?? '0')}%)</td><td class="num">${formatEtb(d.taxAmountEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(d.totalPriceEtb)}</td></tr>
  </table>

  ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}`;

  return renderLayout({
    branding,
    documentTitle: 'QUOTATION',
    badge: d.status,
    bodyHtml,
    footerNote: `This quotation is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
