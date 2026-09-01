import type { TenantBranding } from '../document-pdf.service';
import {
  esc,
  renderLayout,
  renderParties,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';

export interface PaymentScheduleInstalment {
  /** 1-based position — the agreed order, printed as the row number. */
  sequence: number;
  label: string;
  dueDate?: Date | string | null;
  amountEtb: string;
}

/**
 * Shape `DocumentPdfService.renderDocumentPdf('payment-schedule', data,
 * branding)` expects.
 *
 * `scheduledTotalEtb` is passed in rather than summed here: the template is
 * a pure renderer, and the money arithmetic already exists once, in
 * `scheduleTotalEtb` (contracts module), which is also what the API
 * validates the schedule against. Two places summing money is two places
 * for it to disagree.
 */
export interface PaymentScheduleTemplateData {
  contractNumber: string;
  /** Signature date once signed, issue date while still a draft. */
  contractDate?: Date | string | null;
  status: string;
  customerName: string;
  projectName: string;
  contractValueEtb?: string | null;
  scheduledTotalEtb?: string | null;
  instalments: readonly PaymentScheduleInstalment[];
}

/**
 * The Payment Schedule: the instalments the customer has agreed to pay
 * against a contract, and when.
 *
 * Deliberately shows no instalment status. PENDING/INVOICED is our own
 * bookkeeping of which milestones we have billed so far; the customer's
 * copy is the agreed plan, and a status column would make the same document
 * say something different every time it is reprinted.
 *
 * Both totals print. They are validated to be equal when the schedule is
 * saved, so showing them side by side costs one row and makes a schedule
 * that somehow drifted from its contract impossible to sign without
 * noticing.
 */
export const buildPaymentScheduleHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as PaymentScheduleTemplateData;

  const rows = d.instalments
    .map(
      (i) => `<tr>
        <td class="num">${esc(i.sequence)}</td>
        <td>${esc(i.label)}</td>
        <td>${fmtDate(i.dueDate)}</td>
        <td class="num">${formatEtb(i.amountEtb)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Contract No.', value: d.contractNumber },
    { label: 'Date', value: fmtDate(d.contractDate) },
    { label: 'Status', value: d.status },
  ])}

  ${renderParties(branding, {
    label: 'Payable By',
    lines: [d.customerName, `Project: ${d.projectName}`],
  })}

  <h2>Instalments</h2>
  <table class="lines">
    <thead>
      <tr><th class="num">No.</th><th>Milestone</th><th>Due</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="4">No instalments have been agreed for this contract</td></tr>'}</tbody>
  </table>

  <div class="sum-block">
  <table class="totals">
    <tbody>
    <tr><td>Contract value</td><td class="num">${formatEtb(d.contractValueEtb)}</td></tr>
    <tr class="grand"><td>Total scheduled</td><td class="num">${formatEtb(d.scheduledTotalEtb)}</td></tr>
    </tbody>
  </table>
  </div>

  ${renderSignaturePair(
    { caption: 'For the contractor', lines: [branding?.name] },
    { caption: 'For the customer', lines: [d.customerName] },
  )}`;

  return renderLayout({
    branding,
    documentTitle: 'PAYMENT SCHEDULE',
    bodyHtml,
    footerNote: `This payment schedule forms part of contract ${d.contractNumber}. Amounts in ETB.`,
  });
};
