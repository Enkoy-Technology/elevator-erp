import type { DocumentTemplate, TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import { fmtDate } from './quotation.template';

/**
 * Registry key for this builder. Named for what the client's proposal calls
 * it. The union used to carry 'installation-certificate' instead — a
 * leftover from the parked installation module, which this document is not
 * part of: it certifies that a CONTRACT was completed and handed over.
 */
export const COMPLETION_CERTIFICATE_TEMPLATE: DocumentTemplate = 'completion-certificate';

/**
 * Shape `DocumentPdfService.renderDocumentPdf('completion-certificate',
 * data, branding)` expects.
 *
 * `handedOverAt`/`handedOverToName` are non-nullable: this document only
 * exists because a handover was recorded, and a completion certificate with
 * no date and nobody named on it certifies nothing.
 */
export interface CompletionCertificateTemplateData {
  contractNumber: string;
  projectName: string;
  customerName: string;
  /** What the company contracted to deliver, copied off the contract. */
  scopeOfWork?: string | null;
  handedOverAt: string;
  handedOverToName: string;
  handoverNotes?: string | null;
}

/**
 * A free-text block the way maintenance-report.template.ts renders one:
 * `white-space:pre-wrap` inlined (only the free-text documents need it), and
 * an empty field prints an em dash rather than vanishing — a certificate
 * with a section silently missing is not a record anyone can audit.
 */
const block = (label: string, value: string | null | undefined): string => `
  <h2>${esc(label)}</h2>
  <div class="notes" style="white-space:pre-wrap">${value ? esc(value) : '&mdash;'}</div>`;

/**
 * Build the branded completion-certificate HTML document. Pure — no I/O —
 * and every interpolated field is escaped. The two-party signature block is
 * printed for wet signing on the day of handover, same shape as the
 * maintenance report's technician/customer pair.
 */
export const buildCompletionCertificateHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as CompletionCertificateTemplateData;

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Contract No.', value: d.contractNumber },
    { label: 'Project', value: d.projectName },
    { label: 'Handover Date', value: fmtDate(d.handedOverAt) },
    { label: 'Accepted By', value: d.handedOverToName },
  ])}

  ${renderParties(branding, {
    label: 'Issued To',
    lines: [d.customerName, `Project: ${d.projectName}`],
  })}

  <div class="notes">
    This certifies that the works described below, under contract
    ${esc(d.contractNumber)}, were completed and handed over to
    ${esc(d.customerName)} on ${esc(d.handedOverAt)}, and were accepted on the
    customer's behalf by ${esc(d.handedOverToName)}.
  </div>

  ${block('Scope of Work Delivered', d.scopeOfWork)}
  ${block('Handover Notes', d.handoverNotes)}

  ${renderSignaturePair(
    { caption: 'For the contractor', lines: [branding?.name] },
    {
      caption: 'For the customer',
      lines: [`${d.handedOverToName}, ${d.customerName}`],
    },
  )}`;

  return renderLayout({
    branding,
    documentTitle: 'COMPLETION CERTIFICATE',
    bodyHtml,
    footerNote:
      'Signed by both parties on handover. One copy for the customer, one retained.',
  });
};
