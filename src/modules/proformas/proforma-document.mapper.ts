import type { ColumnDef } from '../../common/export/tabular';
import { vatPercentLabel } from '../../common/export/templates/money-format';
import type { ProformaTemplateData } from '../../common/export/templates/proforma.template';

/**
 * The fields proformaDocumentData/PROFORMA_DOCUMENT_COLUMNS actually read —
 * narrower than ProformaRecord (which ProformasRepository.
 * findByIdForDocument's joined row structurally satisfies, plus
 * customerName/projectName). Kept narrow so this type doubles as the
 * minimal fixture shape a test needs.
 *
 * No marginPercent/marginAmountEtb/taxPercent here: the customer-facing
 * document does not disclose the client's markup (decision (a)) and the VAT
 * rate is derived from subtotalEtb/vatEtb instead of stored (see
 * vatPercentLabel) — technicalSpec/pricingBreakdown are still carried
 * (proforma's own snapshot columns, not a quotation join — see
 * ProformasRepository.findByIdForDocument) even though the template only
 * renders technicalSpec; pricingBreakdown stays available as an internal
 * audit trail for Phase 4.
 */
export interface ProformaDocumentRow {
  proformaNumber: string;
  status: string;
  issuedAt: Date;
  validUntil: string | null;
  customerName: string | null;
  projectName: string | null;
  technicalSpec: unknown;
  subtotalEtb: string;
  vatEtb: string;
  totalEtb: string;
}

/**
 * Maps a proforma row to the data shape both DocumentPdfService and
 * DocumentDocxService consume for the 'proforma' template. Money fields
 * pass through as raw decimal strings — buildProformaHtml/buildProformaDocx
 * call formatEtb() themselves, same as the quotation template.
 */
export const proformaDocumentData = (p: ProformaDocumentRow): ProformaTemplateData => ({
  proformaNumber: p.proformaNumber,
  status: p.status,
  issuedAt: p.issuedAt,
  validUntil: p.validUntil,
  customerName: p.customerName ?? '',
  projectName: p.projectName ?? '',
  technicalSpec: p.technicalSpec as Record<string, unknown> | null,
  subtotalEtb: p.subtotalEtb,
  taxPercent: vatPercentLabel(p.subtotalEtb, p.vatEtb),
  vatEtb: p.vatEtb,
  totalEtb: p.totalEtb,
  // proformas has no notes column of its own (see database/schema/proformas.ts).
  notes: null,
});

/**
 * Columns for the single-proforma xlsx download. The joined
 * ProformaDocumentRow IS the export row — writeXlsx reads `row[col.key]`
 * directly, mirroring PROFORMAS_EXPORT_COLUMNS' use of ProformaRecord
 * fields (in proformas.controller.ts) for the list export.
 */
export const PROFORMA_DOCUMENT_COLUMNS: ColumnDef[] = [
  { key: 'proformaNumber', header: 'Proforma Number' },
  { key: 'status', header: 'Status' },
  { key: 'projectName', header: 'Project' },
  { key: 'customerName', header: 'Customer' },
  { key: 'issuedAt', header: 'Issued At', format: 'date' },
  { key: 'validUntil', header: 'Valid Until', format: 'date' },
  { key: 'subtotalEtb', header: 'Subtotal (ETB)', format: 'money' },
  { key: 'vatEtb', header: 'VAT (ETB)', format: 'money' },
  { key: 'totalEtb', header: 'Total (ETB)', format: 'money' },
];
