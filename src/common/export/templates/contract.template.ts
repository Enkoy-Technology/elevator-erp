import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import {
  esc,
  renderLayout,
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
 * The article structure follows the company's own paper "Contract Agreement
 * for the Supply and Installation of Passenger Elevators": parties,
 * definitions, object (the equipment), obligations of each side, price,
 * payment, warranty, penalties, disputes, signatures and witnesses. Each
 * numbered clause that the paper form states as a figure has a typed field
 * here; a clause with no value prints a neutral sentence rather than a
 * blank line for someone to fill in by hand.
 *
 * `contractValueEtb` is non-nullable: an agreement with no value on it is
 * not an agreement. Everything else is optional because a draft is written
 * incrementally.
 */
export interface ContractPartyDetails {
  address?: string | null;
  phone?: string | null;
  tin?: string | null;
}

/** One line of the proforma the contract was issued from — their Article 2. */
export interface ContractEquipmentLine {
  quantity: number;
  productType: string;
  specSummary?: string | null;
  machineRoomLabel?: string | null;
  tractionMachineType?: string | null;
  controlSystem?: string | null;
  powerSupply?: string | null;
}

/** One row of the agreed payment schedule — their Article 5. */
export interface ContractInstalmentLine {
  label: string;
  amountEtb: string;
  dueDate?: Date | string | null;
}

export interface ContractTemplateData {
  contractNumber: string;
  status: string;
  /** When the contract was issued. Dates the DRAFT, which has no signature date. */
  issuedAt?: Date | string | null;
  /** Null while DRAFT — the whole point of the draft/signed split. */
  signedAt?: Date | string | null;
  customerName: string;
  customer?: ContractPartyDetails | null;
  projectName: string;
  contractValueEtb: string;
  equipment?: readonly ContractEquipmentLine[] | null;
  instalments?: readonly ContractInstalmentLine[] | null;
  scopeOfWork?: string | null;
  termsAndConditions?: string | null;
  warrantyMonths?: number | null;
  deliveryWorkingDays?: number | null;
  installationWorkingDays?: number | null;
  /** Percent of the contract price per day, as a decimal string ("0.020"). */
  delayPenaltyPercentPerDay?: string | null;
  /** Ceiling as a percent of the contract price ("5.00"). */
  delayPenaltyCapPercent?: string | null;
  advanceGuaranteeRequired?: boolean | null;
  freeMaintenanceMonths?: number | null;
  disputeForum?: string | null;
}

/** "0.020" -> "0.02%", "5.00" -> "5%". Trailing zeros are noise on a contract. */
const pct = (value: string): string => {
  const n = Number(value);
  return Number.isFinite(n) ? `${String(Number(n.toFixed(3)))}%` : `${value}%`;
};

const months = (n: number): string => `${n} month${n === 1 ? '' : 's'}`;
const workingDays = (n: number): string =>
  `${n} working day${n === 1 ? '' : 's'}`;

const article = (n: number, title: string, body: string): string =>
  `<h2>Article ${n}: ${esc(title)}</h2>${body}`;

/** Each sub-clause is a paragraph of its own; a line break between them read as one crowded block. */
const clause = (text: string): string =>
  text
    .split('<br/>')
    .map((part) => `<p class="prose">${part}</p>`)
    .join('');

/**
 * Sub-clauses numbered at render time from the ones that survive, so an
 * omitted clause never leaves a gap ("6.1, 6.3") that reads as a missing
 * paragraph on a signed document. Each entry is already-escaped HTML.
 */
const numbered = (n: number, items: readonly (string | null)[]): string =>
  clause(
    items
      .filter((item): item is string => Boolean(item))
      .map((item, i) => `${n}.${i + 1} ${item}`)
      .join('<br/>'),
  );

/** One party's block in the parties table: name in bold, then details. */
const party = (
  role: string,
  name: string,
  details: ContractPartyDetails | null | undefined,
): string => {
  const lines = [
    details?.address ? `Address: ${details.address}` : null,
    details?.phone ? `Tel: ${details.phone}` : null,
    details?.tin ? `TIN: ${details.tin}` : null,
  ].filter((line): line is string => Boolean(line));
  return `<td><div class="plate-label">${esc(role)}</div><div class="party-name">${esc(name)}</div>${lines
    .map((line) => `<div class="party-line">${esc(line)}</div>`)
    .join('')}</td>`;
};

const equipmentTable = (lines: readonly ContractEquipmentLine[]): string => {
  const rows = lines
    .map((line) => {
      const details = [
        line.machineRoomLabel,
        line.tractionMachineType,
        line.controlSystem,
        line.powerSupply,
      ]
        .filter(Boolean)
        .join(' / ');
      return `<tr><td class="num">${esc(line.quantity)}</td><td>${esc(line.productType)}</td><td>${esc(line.specSummary ?? '—')}</td><td>${esc(details || '—')}</td></tr>`;
    })
    .join('');
  return `<table class="lines"><thead><tr><th class="num">Units</th><th>Type</th><th>Specification</th><th>Configuration</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const instalmentTable = (
  instalments: readonly ContractInstalmentLine[],
  total: string,
): string => {
  const totalNum = Number(total) || 0;
  // A schedule copied from the proforma is event-based ("50% on signing")
  // and carries no dates; a column of dashes reads as something missing,
  // so the Due column only appears once at least one date has been set.
  const withDates = instalments.some((row) => row.dueDate);
  const rows = instalments
    .map((row, i) => {
      const share =
        totalNum > 0
          ? Math.round((Number(row.amountEtb) / totalNum) * 1000) / 10
          : null;
      return `<tr><td class="num">${i + 1}</td><td>${esc(row.label)}</td><td class="num">${share == null ? '—' : `${share}%`}</td><td class="num">${formatEtb(row.amountEtb)}</td>${withDates ? `<td>${esc(fmtDate(row.dueDate))}</td>` : ''}</tr>`;
    })
    .join('');
  return `<table class="lines"><thead><tr><th class="num">#</th><th>Instalment</th><th class="num">Share</th><th class="num">Amount</th>${withDates ? '<th>Due</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
};

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
  const supplier = branding?.name ?? 'the Supplier';
  const supplierDetails: ContractPartyDetails = {
    address: branding?.address ?? null,
    phone: branding?.phones?.[0] ?? null,
    tin: branding?.taxId ?? null,
  };

  const equipment = d.equipment ?? [];
  const instalments = d.instalments ?? [];

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

  <table class="parties"><tbody><tr>
    ${party('The Client', d.customerName, d.customer)}
    ${party('The Supplier', supplier, supplierDetails)}
  </tr></tbody></table>

  <div class="notes">
    This Contract Agreement is made between ${esc(d.customerName)} (the
    "Client") and ${esc(supplier)} (the "Supplier") for the supply,
    installation, testing and commissioning of the equipment described
    below at ${esc(d.projectName)}${
      isDraft
        ? '. This is a DRAFT for review and is not binding on either party until signed by both.'
        : `, and was signed by both parties on ${esc(fmtDate(d.signedAt))}.`
    }
  </div>

  ${article(
    1,
    'Definitions',
    clause(
      '1.1 "Contract" means this agreement together with the attached proforma, technical specifications and signed annexes.<br/>' +
        '1.2 "Contract Price" means the total price payable to the Supplier for the equipment and services under this Contract.<br/>' +
        '1.3 "Effective Date" means the date the first payment is received and the erection layout drawings are jointly approved.<br/>' +
        '1.4 "Site" means the building project named above.<br/>' +
        '1.5 "Work" means the supply of the equipment, inland transport, installation, testing and commissioning.',
    ),
  )}

  ${article(
    2,
    'Object of the Contract',
    clause(
      'The Supplier shall supply, install and commission the following equipment:',
    ) +
      (equipment.length > 0
        ? equipmentTable(equipment)
        : clause('As specified in the attached proforma.')) +
      (d.scopeOfWork
        ? `<div class="notes" style="white-space:pre-wrap">${esc(d.scopeOfWork)}</div>`
        : '') +
      clause(
        'All materials and equipment supplied shall conform to the technical specification approved by the Client. Any failure to deliver the approved materials or equipment is the responsibility of the Supplier.',
      ),
  )}

  ${article(
    3,
    'Obligations of the Supplier',
    clause(
      '3.1 Technical guidance: advise the Client on shaft preparation, electric power outlets and civil requirements before delivery.<br/>' +
        `3.2 Delivery: deliver all equipment to the Site ${
          d.deliveryWorkingDays == null
            ? 'within the period stated in the attached proforma'
            : `within ${esc(workingDays(d.deliveryWorkingDays))} from the Effective Date`
        }.<br/>` +
        `3.3 Installation: complete erection and commissioning ${
          d.installationWorkingDays == null
            ? 'within a reasonable period'
            : `within ${esc(workingDays(d.installationWorkingDays))}`
        } from the date the Notice of Site Readiness is jointly signed.<br/>` +
        '3.4 Training: provide emergency rescue and operational training for the personnel the Client assigns.<br/>' +
        "3.5 Site safety: provide all necessary personal protective equipment and maintain workmen's compensation insurance for its labour force.",
    ),
  )}

  ${article(
    4,
    'Obligations of the Client and Contract Price',
    clause(
      '4.1 Site access: provide immediate site access and a secure, dry, lockable storage room for materials.<br/>' +
        "4.2 Infrastructure: provide 3-phase electric power and scaffolding, and complete all civil works (shaft, pit, floor slabs) to the Supplier's technical drawings.<br/>" +
        '4.3 Contract Price: the Client shall pay the Supplier the fixed, non-adjustable sum below for the Work, unless otherwise agreed in writing by both parties.',
    ) +
      `<div class="sum-block"><table class="totals"><tbody>
    <tr class="grand"><td>Contract Price</td><td class="num">${formatEtb(d.contractValueEtb)}</td></tr>
    <tr><td colspan="2">${esc(amountInWords(d.contractValueEtb))}</td></tr>
    </tbody></table></div>`,
  )}

  ${article(
    5,
    'Terms of Payment',
    (instalments.length > 0
      ? instalmentTable(instalments, d.contractValueEtb)
      : clause('Payment falls due as stated in the attached proforma.')) +
      numbered(5, [
        d.advanceGuaranteeRequired
          ? 'The advance payment is released only against a guarantee cheque from the Supplier of equal value.'
          : null,
        'The Supplier manages customs clearance. Any delay in payment by the Client entitles the Supplier to claim the associated costs.',
      ]),
  )}

  ${article(
    6,
    'Warranty and Maintenance',
    numbered(6, [
      `Warranty: ${
        d.warrantyMonths == null
          ? 'as stated in the attached proforma'
          : `${esc(months(d.warrantyMonths))} from the date of handover`
      }.`,
      d.freeMaintenanceMonths == null
        ? null
        : `Maintenance: ${esc(months(d.freeMaintenanceMonths))} of monthly preventive service and emergency repairs at no charge to the Client, from the date of handover.`,
      'Exclusions: the warranty does not cover damage from power surges or unauthorised third-party intervention.',
    ]),
  )}

  ${article(
    7,
    'Penalties and Remedies',
    clause(
      (d.delayPenaltyPercentPerDay == null
        ? '7.1 Delay: if the Supplier fails to hand over within the agreed period, the parties shall agree a remedy in writing.<br/>'
        : `7.1 Delay: if the Supplier fails to hand over within the agreed period, the Client may deduct ${esc(pct(d.delayPenaltyPercentPerDay))} of the Contract Price for each day of delay${
            d.delayPenaltyCapPercent == null
              ? ''
              : `, up to a maximum of ${esc(pct(d.delayPenaltyCapPercent))}`
          }.<br/>`) +
        "7.2 Non-payment: if the Client defaults on a payment, the Supplier may suspend the Work only after fifteen (15) days' written notice.",
    ),
  )}

  ${article(
    8,
    'Dispute Resolution',
    clause(
      '8.1 Governing law: this Contract is governed by the laws of the Federal Democratic Republic of Ethiopia.<br/>' +
        `8.2 Any dispute that cannot be settled amicably shall be referred to ${esc(
          d.disputeForum || 'the competent court',
        )}.`,
    ),
  )}
${
  d.termsAndConditions
    ? article(
        9,
        'Additional Terms',
        `<div class="notes" style="white-space:pre-wrap">${esc(d.termsAndConditions)}</div>`,
      )
    : ''
}
  ${renderSignaturePair(
    { caption: 'For the Client', lines: [d.customerName] },
    { caption: 'For the Supplier', lines: [branding?.name] },
  )}
  ${renderSignaturePair({ caption: 'Witness 1' }, { caption: 'Witness 2' })}`;

  return renderLayout({
    branding,
    documentTitle: isDraft ? 'CONTRACT DRAFT' : 'CONTRACT',
    coverLines: ['Between', d.customerName, 'and', supplier],
    bodyHtml,
    footerNote: isDraft
      ? 'DRAFT for review — not binding until signed by both parties. Amounts in ETB.'
      : 'Signed by both parties. One copy for the Client, one retained by the Supplier. Amounts in ETB.',
  });
};
