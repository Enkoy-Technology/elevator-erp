import type { TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
} from './layout';
import { formatEtb } from './money-format';

export { formatEtb };

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
// Rows are rendered only when the key is present in the stored breakdown, so
// quotes issued before the price-list change keep rendering their own (TAD
// multiplier model) rows and new quotes render the price-list rows.
export const PRICING_ROWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'basePrice', label: 'Base price' },
  { key: 'stopsAdjustment', label: 'Additional stops' },
  { key: 'capacityAdjustment', label: 'Additional capacity' },
  { key: 'baseCost', label: 'Base equipment' },
  { key: 'stopCost', label: 'Additional stops' },
  { key: 'speedPremium', label: 'Speed premium' },
  { key: 'doorPremium', label: 'Door premium' },
  { key: 'installationCost', label: 'Installation' },
  { key: 'freightCost', label: 'Freight' },
];

/**
 * What the customer sees instead of the raw enum. A product not listed here
 * falls back to its own value rather than disappearing off the document.
 */
const PRODUCT_LABELS: Record<string, string> = {
  PASSENGER: 'Passenger / hospital elevator',
  CAR_PLATFORM_LIFT: 'Car platform lift',
  ESCALATOR: 'Escalator',
};

// `productType` leads: it is the one row that is always present, and on a
// flat-priced escalator or platform lift it is the ONLY row — the EN 81
// geometry below it is null for those products (see TechnicalSpecs), so the
// `!= null` filter in both renderers drops car/shaft/counterweight/rail
// rather than printing a lift's specification on a machine that has none.
export const TECH_ROWS: ReadonlyArray<{
  key: string;
  label: string;
  unit?: string;
  format?: (value: unknown) => string;
}> = [
  {
    key: 'productType',
    label: 'Product',
    format: (v) => PRODUCT_LABELS[String(v)] ?? String(v),
  },
  { key: 'capacityPersons', label: 'Rated capacity', unit: 'persons' },
  { key: 'carWidthMm', label: 'Car width', unit: 'mm' },
  { key: 'carDepthMm', label: 'Car depth', unit: 'mm' },
  { key: 'shaftWidthMm', label: 'Shaft width', unit: 'mm' },
  { key: 'shaftDepthMm', label: 'Shaft depth', unit: 'mm' },
  { key: 'pitDepthMm', label: 'Pit depth', unit: 'mm' },
  { key: 'motorPowerKw', label: 'Motor power', unit: 'kW' },
  { key: 'guideRailSpec', label: 'Guide rail' },
  // Null on an MRL machine, so the `!= null` filter drops these three there.
  { key: 'machineRoomWidthMm', label: 'Machine room width', unit: 'mm' },
  { key: 'machineRoomDepthMm', label: 'Machine room depth', unit: 'mm' },
  { key: 'machineRoomHeightMm', label: 'Machine room height', unit: 'mm' },
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
    .map((r) => {
      const value = r.format ? r.format(tech[r.key]) : tech[r.key];
      return `<tr><td>${r.label}</td><td class="num">${esc(value)}${r.unit ? ` ${r.unit}` : ''}</td></tr>`;
    })
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Quote No.', value: d.quoteNumber },
    { label: 'Issued', value: fmtDate(d.createdAt) },
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
  <table class="lines">
    <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${pricingRows}</tbody>
  </table>

  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr><td>Subtotal</td><td class="num">${formatEtb(d.subtotalEtb)}</td></tr>
    <tr><td>Margin (${esc(d.marginPercent ?? '0')}%)</td><td class="num">${formatEtb(d.marginAmountEtb)}</td></tr>
    <tr><td>Tax (${esc(d.taxPercent ?? '0')}%)</td><td class="num">${formatEtb(d.taxAmountEtb)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${formatEtb(d.totalPriceEtb)}</td></tr>
    </tbody>
  </table>
  </div>

  ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}

  ${renderSignatureBlock(branding)}`;

  return renderLayout({
    branding,
    documentTitle: 'QUOTATION',
    bodyHtml,
    footerNote: `This quotation is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
