import type { ColumnDef } from '../../common/export/tabular';
import type { QuotationTemplateData } from '../../common/export/templates/quotation.template';
import type { TechnicalProposalTemplateData } from '../../common/export/templates/technical-proposal.template';

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
}

/**
 * Maps a quotation row to the one data shape both DocumentPdfService and
 * DocumentDocxService consume for the 'quotation' template (Phase 2's
 * pdf/docx contract). Money fields are passed through as raw decimal
 * strings, not pre-formatted — buildQuotationHtml/buildQuotationDocx call
 * formatEtb() themselves (see quotation.template.ts).
 */
export const quotationDocumentData = (q: QuotationDocumentRow): QuotationTemplateData => ({
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
