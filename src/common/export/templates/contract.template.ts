import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';

/**
 * Shape `DocumentPdfService.renderDocumentPdf('contract', data, branding)`
 * expects.
 *
 * ONE builder renders BOTH documents the client's proposal lists as
 * separate items ("Contract Draft" and "Contract"): they are one record
 * rendered at two points in its life, so the difference is a branch on
 * `status`, not a second template. DRAFT prints "CONTRACT DRAFT" and no
 * signature date; anything past DRAFT prints "CONTRACT" and the date the
 * parties actually signed.
 *
 * `contractValueEtb` is non-nullable: an agreement with no value on it is
 * not an agreement. Everything else is optional because a draft is written
 * incrementally — an unfilled scope prints an em dash rather than vanishing,
 * so nobody signs a page with a section silently missing.
 */
export interface ContractTemplateData {
  contractNumber: string;
  status: string;
  /** When the contract was issued. Dates the DRAFT, which has no signature date. */
  issuedAt?: Date | string | null;
  /** Null while DRAFT — the whole point of the draft/signed split. */
  signedAt?: Date | string | null;
  customerName: string;
  projectName: string;
  contractValueEtb: string;
  scopeOfWork?: string | null;
  termsAndConditions?: string | null;
  warrantyMonths?: number | null;
}

/**
 * A free-text block, same shape completion-certificate.template.ts renders
 * one: `white-space:pre-wrap` inlined (only the free-text documents need
 * it), and an empty field prints an em dash rather than dropping the
 * heading.
 */
const block = (label: string, value: string | null | undefined): string => `
  <h2>${esc(label)}</h2>
  <div class="notes" style="white-space:pre-wrap">${value ? esc(value) : '&mdash;'}</div>`;

/**
 * Build the branded contract HTML document. Pure — no I/O — and every
 * interpolated field is escaped.
 *
 * The value is printed as figures AND as words, the way a cheque is: this
 * is the one number on the page worth altering after signing, and two
 * independent renderings of it make an alteration visible.
 */
export const buildContractHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as ContractTemplateData;
  const isDraft = d.status === 'DRAFT';
  const contractor = branding?.name ?? 'the Contractor';

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Contract No.', value: d.contractNumber },
    { label: 'Project', value: d.projectName },
    // A draft is dated when it was drafted, never when it was "signed" —
    // but it IS dated: an undated page invites someone to write a date in.
    isDraft
      ? { label: 'Drafted', value: fmtDate(d.issuedAt) }
      : { label: 'Signed', value: fmtDate(d.signedAt) },
    { label: 'Status', value: d.status },
  ])}

  ${renderParties(branding, {
    label: 'Contract With',
    lines: [d.customerName, `Project: ${d.projectName}`],
  })}

  <div class="notes">
    This agreement is made between ${esc(contractor)} (the Contractor) and
    ${esc(d.customerName)} (the Client) for the works described below at
    ${esc(d.projectName)}${
      isDraft
        ? '. This is a DRAFT for review and is not binding on either party until signed by both.'
        : `, and was signed by both parties on ${esc(fmtDate(d.signedAt))}.`
    }
  </div>

  ${block('Scope of Work', d.scopeOfWork)}

  <h2>Contract Value</h2>
  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr class="grand"><td>Total contract value</td><td class="num">${formatEtb(d.contractValueEtb)}</td></tr>
    <tr><td colspan="2">${esc(amountInWords(d.contractValueEtb))}</td></tr>
    </tbody>
  </table>
  </div>
${
  d.warrantyMonths == null
    ? ''
    : `
  <h2>Warranty</h2>
  <div class="notes">
    The Contractor warrants the works for ${esc(d.warrantyMonths)} months from
    the date of handover.
  </div>`
}
  ${block('Terms and Conditions', d.termsAndConditions)}

  ${renderSignaturePair(
    {
      caption: 'For the Contractor',
      lines: [branding?.name, 'Name, signature and date'],
    },
    {
      caption: 'For the Client',
      lines: [d.customerName, 'Name, signature and date'],
    },
  )}`;

  return renderLayout({
    branding,
    documentTitle: isDraft ? 'CONTRACT DRAFT' : 'CONTRACT',
    bodyHtml,
    footerNote: isDraft
      ? 'DRAFT for review — not binding until signed by both parties. Amounts in ETB.'
      : 'Signed by both parties. One copy for the Client, one retained by the Contractor. Amounts in ETB.',
  });
};
