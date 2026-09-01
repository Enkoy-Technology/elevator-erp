import type { DocumentTemplate, TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import { fmtDate } from './quotation.template';

export { fmtDate };

/** Registry key for this builder; already a member of DocumentTemplate. */
export const MAINTENANCE_REPORT_TEMPLATE: DocumentTemplate = 'maintenance-report';

/**
 * Shape `DocumentPdfService.renderDocumentPdf('maintenance-report', data,
 * branding)` expects. This is the client's own Maintenance Form: it is
 * filled in the field, printed, and signed on paper by the customer — so
 * every field their form names has a place here even when it is empty, and
 * an empty one prints an em dash rather than disappearing (a service record
 * with a section silently missing is not a record anyone can audit).
 */
export interface MaintenanceReportTemplateData {
  /** Human-quotable contract reference — the maintenance contract's id. */
  contractRef: string;
  /** The client's "Elevator Number": serial if the asset has one, else its name. */
  elevatorNumber: string;
  assetName: string;
  buildingName?: string | null;
  customerName: string;
  visitedAt?: Date | string | null;
  technicianName?: string | null;
  inspectionResults?: string | null;
  partsReplaced?: string | null;
  recommendations?: string | null;
  /** The pre-existing free-text field. Rendered only when set. */
  notes?: string | null;
}

/**
 * A field the technician typed as several lines stays several lines:
 * `white-space:pre-wrap` is inlined rather than added to layout.ts's
 * stylesheet because this is the only document with free-text blocks.
 */
const block = (label: string, value: string | null | undefined): string => `
  <h2>${esc(label)}</h2>
  <div class="notes" style="white-space:pre-wrap">${value ? esc(value) : '&mdash;'}</div>`;

/**
 * Build the branded maintenance-report HTML document. Pure — no I/O — and
 * every interpolated field is escaped.
 */
export const buildMaintenanceReportHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as MaintenanceReportTemplateData;

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Contract Ref.', value: d.contractRef },
    { label: 'Elevator No.', value: d.elevatorNumber },
    { label: 'Service Date', value: fmtDate(d.visitedAt) },
    { label: 'Technician', value: d.technicianName ?? '—' },
  ])}

  ${renderParties(branding, {
    label: 'Service Performed For',
    lines: [d.customerName, d.assetName, ...(d.buildingName ? [d.buildingName] : [])],
  })}

  ${block('Inspection Results', d.inspectionResults)}
  ${block('Parts Replaced', d.partsReplaced)}
  ${block('Recommendations', d.recommendations)}
  ${d.notes ? block('Additional Notes', d.notes) : ''}

  ${renderSignaturePair(
    {
      caption: 'Technician signature',
      lines: [d.technicianName, branding?.name],
    },
    { caption: 'Customer signature', lines: [d.customerName, 'Date'] },
  )}`;

  return renderLayout({
    branding,
    documentTitle: 'MAINTENANCE REPORT',
    bodyHtml,
    footerNote:
      'Signed by the customer on completion of the service visit. One copy for the customer, one retained.',
  });
};
