import type { DocumentTemplate, TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignatureBlock,
} from './layout';
import { fmtDate, TECH_ROWS } from './quotation.template';

/** Registry key for this builder; already a member of DocumentTemplate. */
export const WARRANTY_CERTIFICATE_TEMPLATE: DocumentTemplate = 'warranty-certificate';

/**
 * Which contract date the warranty clock actually started on. It is printed
 * on the certificate: a customer holding this needs to know whether their
 * cover runs from the day the lift was handed to them or from the day the
 * agreement was signed — those can be a year apart on an installation, and
 * the difference is the difference between a claim being in or out.
 */
export type WarrantyStartBasis = 'HANDOVER' | 'SIGNING';

export interface WarrantyWindow {
  basis: WarrantyStartBasis;
  /** ISO 'YYYY-MM-DD'. */
  startsOn: string;
  /** ISO 'YYYY-MM-DD', `warrantyMonths` after `startsOn`. */
  expiresOn: string;
}

/** Last day of the month `date` currently sits in. */
const daysInMonth = (date: Date): number =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * `iso` + `months`, clamped to the last valid day of the target month —
 * setUTCMonth on its own overflows (Aug 31 + 6 months lands on Mar 3 and
 * silently skips February), which on a warranty is days of free cover the
 * company never agreed to. Same clamp rule as
 * maintenance/recurrence.ts's own private `addMonths`; duplicated rather
 * than shared because that one lives under /modules and this is /common
 * (2nd occurrence — extract on the 3rd, per this codebase's convention).
 */
const addMonthsIso = (iso: string, months: number): string => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day ?? 1, daysInMonth(date)));
  return date.toISOString().slice(0, 10);
};

/**
 * The warranty's start and expiry, or `null` when the contract cannot carry
 * one. Pure, and the single source of truth for the expiry date — the
 * certificate and the expiry reminder both call this, so a certificate can
 * never promise a date the reminder disagrees with.
 *
 * Returns null when `warrantyMonths` is null (a modernisation or
 * service-only agreement may carry no warranty at all: better to refuse to
 * issue than to hand the customer a certificate with a blank period on it),
 * or when neither a handover nor a signing date exists to run it from.
 */
export const warrantyWindow = (contract: {
  warrantyMonths: number | null;
  handedOverAt: string | null;
  signedAt: string | null;
}): WarrantyWindow | null => {
  if (contract.warrantyMonths == null) {
    return null;
  }
  // Handover first: cover starts when the customer actually got the
  // equipment. Signing is the fallback for a contract closed without a
  // recorded handover, and the certificate says so in as many words.
  const basis: WarrantyStartBasis = contract.handedOverAt ? 'HANDOVER' : 'SIGNING';
  const startsOn = contract.handedOverAt ?? contract.signedAt;
  if (!startsOn) {
    return null;
  }
  return {
    basis,
    startsOn,
    expiresOn: addMonthsIso(startsOn, contract.warrantyMonths),
  };
};

/**
 * Shape `DocumentPdfService.renderDocumentPdf('warranty-certificate', data,
 * branding)` expects. `warranty` is non-nullable on purpose: a caller that
 * could not compute a window must refuse to issue the document rather than
 * render one with a blank period (see warrantyWindow above).
 */
export interface WarrantyCertificateTemplateData {
  contractNumber: string;
  customerName: string;
  projectName: string;
  /** The linked proforma's snapshot — the equipment this warranty covers. */
  technicalSpec?: Record<string, unknown> | null;
  warrantyMonths: number;
  warranty: WarrantyWindow;
}

const BASIS_SENTENCE: Record<WarrantyStartBasis, string> = {
  HANDOVER:
    'This warranty period runs from the date the equipment was handed over to the customer.',
  SIGNING:
    'No handover date was recorded for this contract, so this warranty period runs from the date the contract was signed.',
};

/**
 * Build the branded warranty-certificate HTML document. Pure — no I/O — and
 * every interpolated field is escaped. Mirrors proforma.template.ts's
 * TECH_ROWS rendering so the equipment described here is described in the
 * same words, in the same order, as on the proforma the customer already
 * has.
 */
export const buildWarrantyCertificateHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as WarrantyCertificateTemplateData;
  const tech = d.technicalSpec ?? {};

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null)
    .map((r) => {
      const value = r.format ? r.format(tech[r.key]) : tech[r.key];
      return `<tr><td>${r.label}</td><td class="num">${esc(value)}${r.unit ? ` ${r.unit}` : ''}</td></tr>`;
    })
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Contract No.', value: d.contractNumber },
    { label: 'Warranty', value: `${d.warrantyMonths} months` },
    { label: 'Starts', value: fmtDate(d.warranty.startsOn) },
    { label: 'Expires', value: fmtDate(d.warranty.expiresOn) },
  ])}

  ${renderParties(branding, {
    label: 'Issued To',
    lines: [d.customerName, `Project: ${d.projectName}`],
  })}

  <h2>Equipment Covered</h2>
  <table class="lines">
    <thead><tr><th>Item</th><th class="num">Specification</th></tr></thead>
    <tbody>${techRows || '<tr><td>As described in the contract</td><td class="num">&mdash;</td></tr>'}</tbody>
  </table>

  <h2>Warranty Period</h2>
  <div class="notes">
    ${d.warrantyMonths} months, from ${esc(d.warranty.startsOn)} to ${esc(d.warranty.expiresOn)} inclusive.
    ${BASIS_SENTENCE[d.warranty.basis]}
  </div>

  ${renderSignatureBlock(branding)}`;

  return renderLayout({
    branding,
    documentTitle: 'WARRANTY CERTIFICATE',
    bodyHtml,
    footerNote: `Warranty expires ${d.warranty.expiresOn}. Present this certificate with any warranty claim.`,
  });
};
