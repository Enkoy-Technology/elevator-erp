import type { ColumnDef } from '../../common/export/tabular';
import type {
  DocumentAppendixContent,
  DocumentLineData,
  PaymentTermData,
} from '../../common/export/templates/commercial-document';
import type { QuotationTemplateData } from '../../common/export/templates/quotation.template';
import type { TechnicalProposalTemplateData } from '../../common/export/templates/technical-proposal.template';
import { describeFloorPlan } from './quote-spec';

/**
 * One `quotation_lines` row, as the document reads it —
 * `QuotationLineRecord` satisfies this structurally. Narrow on purpose, same
 * reason as QuotationDocumentRow below: it doubles as the fixture shape.
 */
export interface QuotationLineRow {
  sequence: number;
  productType: string;
  specSummary: string | null;
  quantity: number;
  unitPriceEtb: string | null;
  lineTotalEtb: string | null;
  machineRoomLabel: string | null;
  floorLabels: string | null;
  floorDisplaySummary: string | null;
  doorHeightMm: number | null;
  ropingRatio: string | null;
  tractionMachineType: string | null;
  controlSystem: string | null;
  powerSupply: string | null;
  lightSupply: string | null;
  entranceCount: number | null;
  calcInput: unknown;
  technicalSpec: unknown;
}

/** One `quotation_payment_terms` row. */
export interface QuotationPaymentTermRow {
  percent: string;
  label: string;
  triggerEvent: string | null;
}

/**
 * The floor plan is stated four times over on the client's document
 * ("B+G+M+10", "13 floors/13 doors", "13/13/13", and the stop count the
 * price is calculated from) and their pasted copies have already drifted
 * apart. `floor_labels` is the one stored input, so both printed forms are
 * derived from it here rather than typed again — except
 * `floorDisplaySummary`, which IS stored (a salesperson may word it
 * themselves) and only falls back to the derivation when it is not.
 */
const documentLine = (line: QuotationLineRow): DocumentLineData => {
  const plan = describeFloorPlan(line.floorLabels, line.entranceCount);
  return {
    sequence: line.sequence,
    productType: line.productType,
    specSummary: line.specSummary,
    quantity: line.quantity,
    unitPriceEtb: line.unitPriceEtb,
    lineTotalEtb: line.lineTotalEtb,
    machineRoomLabel: line.machineRoomLabel,
    floorDisplaySummary: line.floorDisplaySummary ?? plan?.displaySummary ?? null,
    floorsStopsDoors: plan?.floorsStopsDoors ?? null,
    doorHeightMm: line.doorHeightMm,
    ropingRatio: line.ropingRatio,
    tractionMachineType: line.tractionMachineType,
    controlSystem: line.controlSystem,
    powerSupply: line.powerSupply,
    lightSupply: line.lightSupply,
    calcInput: line.calcInput as Record<string, unknown> | null,
    technicalSpec: line.technicalSpec as Record<string, unknown> | null,
  };
};

const paymentTerm = (term: QuotationPaymentTermRow): PaymentTermData => ({
  percent: term.percent,
  label: term.label,
  triggerEvent: term.triggerEvent,
});

/**
 * The fields quotationDocumentData/QUOTATION_DOCUMENT_COLUMNS actually read
 * — narrower than QuotationRecord (which QuotationsRepository.
 * findByIdForDocument's joined row structurally satisfies, plus
 * customerName/projectName). Kept narrow so this type doubles as the
 * minimal fixture shape a test needs to build.
 */
export interface QuotationDocumentRow {
  quoteNumber: string;
  status: string;
  createdAt: Date;
  validUntil: Date | null;
  customerName: string | null;
  projectName: string | null;
  technicalSpec: unknown;
  /**
   * The stored calc inputs. Optional only so the existing document fixtures
   * (which never needed it) still satisfy this shape — the joined row from
   * QuotationsRepository.findByIdForDocument always carries the column.
   */
  calcInput?: unknown;
  pricingBreakdown: unknown;
  subtotalEtb: string;
  marginPercent: string;
  marginAmountEtb: string;
  taxPercent: string;
  taxAmountEtb: string;
  totalPriceEtb: string;
  notes: string | null;

  // ---------------------------------------------------------------------
  // Everything below is optional ONLY so the existing document fixtures
  // still satisfy this shape. QuotationsService.getDocumentData supplies
  // lines/paymentTerms on every real call, and the commercial columns are
  // real (nullable) columns on `quotations`.
  // ---------------------------------------------------------------------
  lines?: readonly QuotationLineRow[];
  paymentTerms?: readonly QuotationPaymentTermRow[];
  /** Their own offer reference, e.g. "Rodas FUJIHD-E02". */
  referenceCode?: string | null;
  validityDays?: number | null;
  warrantyPartsMonths?: number | null;
  warrantyFreeServiceMonths?: number | null;
  deliveryDays?: number | null;

  /**
   * NEVER mapped onto a customer document. Named here only so a caller
   * spreading the whole repository row into this shape type-checks, and so
   * the omission below is visible rather than accidental.
   */
  calculatedTotalEtb?: string | null;
  discountAmountEtb?: string | null;
  discountPercent?: string | null;
}

/**
 * Maps a quotation row to the one data shape both DocumentPdfService and
 * DocumentDocxService consume for the 'quotation' template (Phase 2's
 * pdf/docx contract). Money fields are passed through as raw decimal
 * strings, not pre-formatted — buildQuotationHtml/buildQuotationDocx call
 * formatEtb() themselves (see quotation.template.ts).
 */
export const quotationDocumentData = (
  q: QuotationDocumentRow,
  content?: DocumentAppendixContent,
): QuotationTemplateData => ({
  quoteNumber: q.quoteNumber,
  status: q.status,
  createdAt: q.createdAt,
  validUntil: q.validUntil,
  customerName: q.customerName ?? '',
  projectName: q.projectName ?? '',
  technicalSpec: q.technicalSpec as Record<string, unknown> | null,
  pricingBreakdown: q.pricingBreakdown as Record<string, string> | null,
  subtotalEtb: q.subtotalEtb,
  marginPercent: q.marginPercent,
  marginAmountEtb: q.marginAmountEtb,
  taxPercent: q.taxPercent,
  taxAmountEtb: q.taxAmountEtb,
  totalPriceEtb: q.totalPriceEtb,
  notes: q.notes,
  lines: (q.lines ?? []).map(documentLine),
  paymentTerms: (q.paymentTerms ?? []).map(paymentTerm),
  referenceCode: q.referenceCode ?? null,
  validityDays: q.validityDays ?? null,
  warrantyPartsMonths: q.warrantyPartsMonths ?? null,
  warrantyFreeServiceMonths: q.warrantyFreeServiceMonths ?? null,
  deliveryDays: q.deliveryDays ?? null,
  // Pages 3+: the tenant's boilerplate and component table, loaded by
  // DocumentContentProvider and passed in — the template does not query, and
  // neither does this. Absent content simply renders no appendix.
  boilerplate: content?.boilerplate,
  components: content?.components,
  // calculatedTotalEtb / discountAmountEtb / discountPercent are NOT mapped:
  // the customer's copy never shows what the price was before negotiation.
});

/**
 * Maps the same row to the standalone technical proposal / technical
 * specification sheet. Deliberately passes NOTHING priced: that document goes
 * to consultants and building owners, and the commercial terms are the
 * quotation's business.
 */
export const technicalProposalData = (
  q: QuotationDocumentRow,
): TechnicalProposalTemplateData => ({
  quoteNumber: q.quoteNumber,
  status: q.status,
  createdAt: q.createdAt,
  customerName: q.customerName ?? '',
  projectName: q.projectName ?? '',
  technicalSpec: q.technicalSpec as Record<string, unknown> | null,
  calcInput: (q.calcInput ?? null) as Record<string, unknown> | null,
});

/**
 * Columns for the single-quotation xlsx download. The joined
 * QuotationDocumentRow IS the export row — writeXlsx reads `row[col.key]`
 * directly, so no separate row-mapper is needed (mirrors
 * PROFORMAS_EXPORT_COLUMNS' use of ProformaRecord fields directly).
 */
export const QUOTATION_DOCUMENT_COLUMNS: ColumnDef[] = [
  { key: 'quoteNumber', header: 'Quote Number' },
  { key: 'status', header: 'Status' },
  { key: 'projectName', header: 'Project' },
  { key: 'customerName', header: 'Customer' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'validUntil', header: 'Valid Until', format: 'date' },
  { key: 'subtotalEtb', header: 'Subtotal (ETB)', format: 'money' },
  { key: 'marginPercent', header: 'Margin %' },
  { key: 'marginAmountEtb', header: 'Margin (ETB)', format: 'money' },
  { key: 'taxPercent', header: 'Tax %' },
  { key: 'taxAmountEtb', header: 'Tax (ETB)', format: 'money' },
  { key: 'totalPriceEtb', header: 'Total (ETB)', format: 'money' },
  { key: 'notes', header: 'Notes' },
];
