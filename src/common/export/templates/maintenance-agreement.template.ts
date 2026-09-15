import type { DocumentTemplate, TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import {
  esc,
  renderLayout,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';

/** Registry key for this builder; a member of DocumentTemplate. */
export const MAINTENANCE_AGREEMENT_TEMPLATE: DocumentTemplate =
  'maintenance-agreement';

/**
 * Shape `DocumentPdfService.renderDocumentPdf('maintenance-agreement', data,
 * branding)` expects. This is the company's own paper "Contract Agreement
 * for Elevator Maintenance & Periodic Service": parties, the elevator, the
 * scope, term and termination, response, price, effectiveness, signatures
 * and witnesses. Every figure the paper form states has a typed field; the
 * standard scope of work is printed unless the contract carries its own.
 */
export interface MaintenanceAgreementTemplateData {
  /** Human-quotable reference — the maintenance contract's id. */
  contractRef: string;
  startDate: Date | string;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerTin?: string | null;
  assetName: string;
  buildingName?: string | null;
  assetSerialNumber?: string | null;
  /** One attribute per line: "Brand: Sigma", "Capacity: 630 kg". */
  specSummary?: string | null;
  recurrence: string;
  monthlyFeeEtb?: string | null;
  feeIncludesVat: boolean;
  termMonths: number;
  autoRenews: boolean;
  noticeDays: number;
  cureDays: number;
  scopeOfWork?: string | null;
}

const STANDARD_SCOPE = [
  'Periodic inspection and lubrication: routine inspection, testing, cleaning and lubrication of mechanical and electrical components to the manufacturer’s specification and applicable safety codes.',
  'Adjustments: brakes, levelling, door operators and other controls adjusted to ensure proper operation.',
  'Safety device testing: safety devices tested as required by code and manufacturer guidelines.',
  'Trouble calls: response to and correction of faults arising from normal wear and tear, 24 hours a day, 7 days a week.',
];

const RECURRENCE_LABEL: Record<string, string> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'every two weeks',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUAL: 'twice a year',
  ANNUAL: 'annually',
};

const months = (n: number): string => `${n} month${n === 1 ? '' : 's'}`;

const article = (n: number, title: string, body: string): string =>
  `<h2>Article ${n}: ${esc(title)}</h2>${body}`;

const clause = (text: string): string => `<p class="prose">${text}</p>`;

const list = (items: readonly string[]): string =>
  `<ul class="terms-list">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;

const party = (
  role: string,
  name: string,
  lines: readonly (string | null | undefined)[],
): string =>
  `<td><div class="plate-label">${esc(role)}</div><div class="party-name">${esc(name)}</div>${lines
    .filter((line): line is string => Boolean(line))
    .map((line) => `<div class="party-line">${esc(line)}</div>`)
    .join('')}</td>`;

/**
 * Build the branded maintenance agreement HTML. Pure — no I/O — and every
 * interpolated field is escaped.
 */
export const buildMaintenanceAgreementHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const d = data as MaintenanceAgreementTemplateData;
  const provider = branding?.name ?? 'the Service Provider';
  const recurrence =
    RECURRENCE_LABEL[d.recurrence] ?? d.recurrence.toLowerCase();
  const specLines = (d.specSummary ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyHtml = `
  ${renderReferencePlate([
    { label: 'Agreement', value: d.contractRef.slice(0, 8).toUpperCase() },
    { label: 'Commences', value: fmtDate(d.startDate) },
    { label: 'Term', value: months(d.termMonths) },
    { label: 'Service', value: recurrence },
  ])}

  <table class="parties"><tbody><tr>
    ${party('The Client', d.customerName, [
      d.customerAddress ? `Address: ${d.customerAddress}` : null,
      d.customerPhone ? `Tel: ${d.customerPhone}` : null,
      d.customerTin ? `TIN: ${d.customerTin}` : null,
    ])}
    ${party('The Service Provider', provider, [
      branding?.address ? `Address: ${branding.address}` : null,
      branding?.phones?.[0] ? `Tel: ${branding.phones[0]}` : null,
      branding?.taxId ? `TIN: ${branding.taxId}` : null,
    ])}
  </tr></tbody></table>

  <div class="notes">
    WHEREAS the Client wishes to award the maintenance and periodic service
    of the elevator described below to the Service Provider, and the Service
    Provider, having the required professional skills, personnel and
    technical resources, agrees to provide those services on the terms set
    out here, the parties agree as follows.
  </div>

  ${article(
    1,
    'Contract Documents',
    clause(
      'This agreement, its attached conditions and the Service Provider’s price quotation together form the Contract Documents and represent the whole agreement between the Client and the Service Provider.',
    ),
  )}

  ${article(
    2,
    'Elevator Specification',
    list([
      `Equipment: ${d.assetName}${d.buildingName ? ` at ${d.buildingName}` : ''}`,
      ...(d.assetSerialNumber ? [`Serial number: ${d.assetSerialNumber}`] : []),
      ...specLines,
    ]),
  )}

  ${article(
    3,
    'Scope of Work',
    clause(
      `The Service Provider shall provide the following services for the elevator listed in Article 2, on a ${esc(recurrence)} schedule:`,
    ) +
      (d.scopeOfWork
        ? `<div class="notes" style="white-space:pre-wrap">${esc(d.scopeOfWork)}</div>`
        : list(STANDARD_SCOPE)),
  )}

  ${article(
    4,
    'Term and Termination',
    clause(
      `4.1 Term: this agreement commences on ${esc(fmtDate(d.startDate))} and continues for an initial term of ${esc(months(d.termMonths))}. ${
        d.autoRenews
          ? `It then renews automatically for successive terms of the same length unless either party gives ${esc(String(d.noticeDays))} days’ written notice before the current term ends.`
          : `It ends when that term expires unless the parties renew it in writing.`
      }<br/>` +
        `4.2 Termination for cause: either party may terminate this agreement immediately if the other breaches a material term and fails to cure the breach within ${esc(String(d.cureDays))} days of written notice.`,
    ),
  )}

  ${article(
    5,
    'Service Response',
    clause(
      `5.1 Routine maintenance is performed ${esc(recurrence)} on the schedule agreed with the Client.<br/>` +
        '5.2 Trouble calls are attended within the response times of the Service Provider’s published service levels.<br/>' +
        '5.3 Entrapment or any other safety hazard is attended on a 24-hour basis.',
    ),
  )}

  ${article(
    6,
    'Price and Terms of Payment',
    d.monthlyFeeEtb
      ? clause(
          `The Client shall pay the Service Provider a fixed monthly fee, ${
            d.feeIncludesVat ? 'inclusive of VAT' : 'exclusive of VAT'
          }, payable on completion of the work in Article 3 for the month and the approved technician checklist.`,
        ) +
          `<div class="sum-block"><table class="totals"><tbody>
    <tr class="grand"><td>Monthly fee</td><td class="num">${formatEtb(d.monthlyFeeEtb)}</td></tr>
    <tr><td colspan="2">${esc(amountInWords(d.monthlyFeeEtb))}</td></tr>
    </tbody></table></div>`
      : clause(
          'The fee is as stated in the Service Provider’s attached price quotation.',
        ),
  )}

  ${article(
    7,
    'Effectiveness',
    clause(
      'This agreement is valid and in full effect from the date both parties have signed and sealed it below. In witness whereof the parties have signed this agreement on the date written beside their signatures.',
    ),
  )}
  ${renderSignaturePair(
    {
      caption: 'For the Client',
      lines: [d.customerName, 'Name, title, signature and date'],
    },
    {
      caption: 'For the Service Provider',
      lines: [branding?.name, 'Name, title, signature and date'],
    },
  )}
  ${renderSignaturePair(
    { caption: 'Witness 1', lines: ['Name, signature and date'] },
    { caption: 'Witness 2', lines: ['Name, signature and date'] },
  )}`;

  return renderLayout({
    branding,
    documentTitle: 'MAINTENANCE & SERVICE AGREEMENT',
    coverLines: ['Between', d.customerName, 'and', provider],
    bodyHtml,
    footerNote:
      'One copy for the Client, one retained by the Service Provider. Amounts in ETB.',
  });
};
