import type { TenantBranding } from '../document-pdf.service';
import {
  PRODUCT_LABELS,
  renderCommercialBody,
  type CommercialTermsData,
  type DocumentAppendixContent,
  type DocumentLineData,
  type PaymentTermData,
} from './commercial-document';
import { renderLayout } from './layout';
import { formatEtb, netOfTaxEtb } from './money-format';

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
export interface QuotationTemplateData
  extends CommercialTermsData,
    DocumentAppendixContent {
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
  /**
   * Page 1's line-item table. Absent on a quotation written before line
   * items existed (and on the docx/xlsx fixtures) — the template then prints
   * the single line the header implies, which is what that quote always was.
   */
  lines?: readonly DocumentLineData[];
  paymentTerms?: readonly PaymentTermData[];
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
 * The single line a document with no line items implies: its own header,
 * priced ex-VAT. Shared by both commercial templates so a pre-lines
 * quotation and a proforma whose lines were never snapshotted still print a
 * real line-item table and a real spec sheet instead of an empty one.
 */
export const impliedLine = (
  technicalSpec: Record<string, unknown> | null | undefined,
  exVatTotalEtb: string,
): DocumentLineData => ({
  sequence: 1,
  productType: (technicalSpec?.productType as string | undefined) ?? null,
  specSummary: null,
  quantity: 1,
  unitPriceEtb: exVatTotalEtb,
  lineTotalEtb: exVatTotalEtb,
  technicalSpec: technicalSpec ?? null,
});

/**
 * Build the branded quotation HTML document, in the shape of the client's
 * own 8-page offer: page 1 commercial, page 2 specification, pages 3+ their
 * boilerplate and component table. Pure — no I/O — so it is unit testable
 * and Puppeteer just renders whatever string this returns. Every
 * interpolated data/branding field is HTML-escaped.
 *
 * The negotiated discount and the calculated-before-negotiation total are
 * deliberately absent: they are recorded on the quotation for the client's
 * own reporting, and printing either on the customer's copy would hand over
 * the negotiating position.
 */
export const buildQuotationHtml = (data: object, branding: TenantBranding | null): string => {
  const d = data as QuotationTemplateData;
  // total - VAT, so the three printed figures always add up to the cent (see
  // netOfTaxEtb) rather than being re-derived from the pre-margin subtotal.
  const exVatTotalEtb = netOfTaxEtb(d.totalPriceEtb, d.taxAmountEtb);
  const lines =
    d.lines && d.lines.length > 0
      ? d.lines
      : [impliedLine(d.technicalSpec, exVatTotalEtb)];

  const bodyHtml = renderCommercialBody({
    branding,
    plate: [
      { label: 'Quote No.', value: d.quoteNumber },
      ...(d.referenceCode ? [{ label: 'Ref.', value: d.referenceCode }] : []),
      { label: 'Issued', value: fmtDate(d.createdAt) },
      { label: 'Status', value: d.status },
    ],
    customerName: d.customerName,
    projectName: d.projectName,
    lines,
    exVatTotalEtb,
    vatPercent: d.taxPercent ?? null,
    vatEtb: d.taxAmountEtb,
    grandTotalEtb: d.totalPriceEtb,
    paymentTerms: d.paymentTerms,
    terms: d,
    boilerplate: d.boilerplate,
    components: d.components,
    notes: d.notes,
  });

  return renderLayout({
    branding,
    documentTitle: 'QUOTATION',
    bodyHtml,
    footerNote: `This quotation is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
  });
};
