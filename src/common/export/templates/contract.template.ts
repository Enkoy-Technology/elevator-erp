import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import {
  esc,
  renderLayout,
  renderReferencePlate,
  renderSignaturePair,
} from './layout';
import {
  PRODUCT_LABELS,
  printsMachineRoom,
  printsTractionDrive,
} from './commercial-document';
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
  /**
   * Kept for callers; NOT printed. On a contract the project name IS the
   * client company (client decision 2026-09-22), so every party line,
   * signature caption and cover line prints `projectName` instead.
   */
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

/**
 * One piece of an article, in plain text: the PDF escapes and draws it
 * (buildContractHtml) and the Word file draws the same piece
 * (buildContractDocx), so the two never word a clause differently.
 */
export type ContractBlock =
  /** A sub-clause, a paragraph of its own. */
  | { kind: 'clause'; text: string }
  /** The tinted panel: the introduction, the scope of work, extra terms. */
  | { kind: 'note'; text: string; preWrap?: boolean }
  | {
      kind: 'table';
      columns: readonly { header: string; num?: boolean }[];
      rows: readonly (readonly string[])[];
    }
  /** The price as figures and as words, the way a cheque is. */
  | { kind: 'price'; label: string; value: string; words: string };

export interface ContractArticle {
  number: number;
  title: string;
  blocks: readonly ContractBlock[];
}

/** One party: a role, the name in bold, then its details. */
export interface ContractParty {
  role: string;
  name: string;
  lines: readonly string[];
}

export interface ContractSignature {
  caption: string;
  lines?: readonly (string | null | undefined)[];
}

/** Everything the contract prints, in order, for both formats. */
export interface ContractContent {
  documentTitle: string;
  coverLines: readonly string[];
  footerNote: string;
  plate: readonly { label: string; value: string }[];
  parties: readonly [ContractParty, ContractParty];
  introduction: string;
  articles: readonly ContractArticle[];
  signatures: readonly (readonly [ContractSignature, ContractSignature])[];
}

const clauses = (...texts: readonly string[]): ContractBlock[] =>
  texts.map((text) => ({ kind: 'clause', text }));

/**
 * Sub-clauses numbered from the ones that survive, so an omitted clause
 * never leaves a gap ("6.1, 6.3") that reads as a missing paragraph on a
 * signed document.
 */
const numbered = (
  n: number,
  items: readonly (string | null)[],
): ContractBlock[] =>
  clauses(
    ...items
      .filter((item): item is string => Boolean(item))
      .map((item, i) => `${n}.${i + 1} ${item}`),
  );

const partyLines = (details: ContractPartyDetails | null | undefined) =>
  [
    details?.address ? `Address: ${details.address}` : null,
    details?.phone ? `Tel: ${details.phone}` : null,
    details?.tin ? `TIN: ${details.tin}` : null,
  ].filter((line): line is string => Boolean(line));

const equipmentTable = (
  lines: readonly ContractEquipmentLine[],
): ContractBlock => ({
  kind: 'table',
  columns: [
    { header: 'Units', num: true },
    { header: 'Type' },
    { header: 'Specification' },
    { header: 'Configuration' },
  ],
  rows: lines.map((line) => {
    const drive = printsTractionDrive(line.productType);
    const details = [
      printsMachineRoom(line.productType) ? line.machineRoomLabel : null,
      drive ? line.tractionMachineType : null,
      drive ? line.controlSystem : null,
      line.powerSupply,
    ]
      .filter(Boolean)
      .join(' / ');
    // The product's name, as the quotation and proforma print it; a
    // product not listed falls back to its own value.
    return [
      String(line.quantity),
      PRODUCT_LABELS[line.productType] ?? line.productType,
      line.specSummary ?? '—',
      details || '—',
    ];
  }),
});

const instalmentTable = (
  instalments: readonly ContractInstalmentLine[],
  total: string,
): ContractBlock => {
  const totalNum = Number(total) || 0;
  // A schedule copied from the proforma is event-based ("50% on signing")
  // and carries no dates; a column of dashes reads as something missing,
  // so the Due column only appears once at least one date has been set.
  const withDates = instalments.some((row) => row.dueDate);
  return {
    kind: 'table',
    columns: [
      { header: '#', num: true },
      { header: 'Instalment' },
      { header: 'Share', num: true },
      { header: 'Amount', num: true },
      ...(withDates ? [{ header: 'Due' }] : []),
    ],
    rows: instalments.map((row, i) => {
      const share =
        totalNum > 0
          ? Math.round((Number(row.amountEtb) / totalNum) * 1000) / 10
          : null;
      return [
        String(i + 1),
        row.label,
        share == null ? '—' : `${share}%`,
        formatEtb(row.amountEtb),
        ...(withDates ? [fmtDate(row.dueDate)] : []),
      ];
    }),
  };
};

/**
 * The contract, article by article, as plain text. Both renderers draw
 * this and nothing else.
 *
 * The value is printed as figures AND as words, the way a cheque is: this
 * is the one number on the page worth altering after signing, and two
 * independent renderings of it make an alteration visible.
 */
export const contractContent = (
  d: ContractTemplateData,
  branding: TenantBranding | null,
): ContractContent => {
  const isDraft = d.status === 'DRAFT';
  const supplier = branding?.name ?? 'the Supplier';
  const equipment = d.equipment ?? [];
  const instalments = d.instalments ?? [];

  const articles: ContractArticle[] = [
    {
      number: 1,
      title: 'Definitions',
      blocks: clauses(
        '1.1 "Contract" means this agreement together with the attached proforma, technical specifications and signed annexes.',
        '1.2 "Contract Price" means the total price payable to the Supplier for the equipment and services under this Contract.',
        '1.3 "Effective Date" means the date the first payment is received and the erection layout drawings are jointly approved.',
        '1.4 "Site" means the building project named above.',
        '1.5 "Work" means the supply of the equipment, inland transport, installation, testing and commissioning.',
      ),
    },
    {
      number: 2,
      title: 'Object of the Contract',
      blocks: [
        ...clauses(
          'The Supplier shall supply, install and commission the following equipment:',
        ),
        equipment.length > 0
          ? equipmentTable(equipment)
          : { kind: 'clause', text: 'As specified in the attached proforma.' },
        ...(d.scopeOfWork
          ? [{ kind: 'note', text: d.scopeOfWork, preWrap: true } as const]
          : []),
        ...clauses(
          'All materials and equipment supplied shall conform to the technical specification approved by the Client. Any failure to deliver the approved materials or equipment is the responsibility of the Supplier.',
        ),
      ],
    },
    {
      number: 3,
      title: 'Obligations of the Supplier',
      blocks: clauses(
        '3.1 Technical guidance: advise the Client on shaft preparation, electric power outlets and civil requirements before delivery.',
        `3.2 Delivery: deliver all equipment to the Site ${
          d.deliveryWorkingDays == null
            ? 'within the period stated in the attached proforma'
            : `within ${workingDays(d.deliveryWorkingDays)} from the Effective Date`
        }.`,
        `3.3 Installation: complete erection and commissioning ${
          d.installationWorkingDays == null
            ? 'within a reasonable period'
            : `within ${workingDays(d.installationWorkingDays)}`
        } from the date the Notice of Site Readiness is jointly signed.`,
        '3.4 Training: provide emergency rescue and operational training for the personnel the Client assigns.',
        "3.5 Site safety: provide all necessary personal protective equipment and maintain workmen's compensation insurance for its labour force.",
      ),
    },
    {
      number: 4,
      title: 'Obligations of the Client and Contract Price',
      blocks: [
        ...clauses(
          '4.1 Site access: provide immediate site access and a secure, dry, lockable storage room for materials.',
          "4.2 Infrastructure: provide 3-phase electric power and scaffolding, and complete all civil works (shaft, pit, floor slabs) to the Supplier's technical drawings.",
          '4.3 Contract Price: the Client shall pay the Supplier the fixed, non-adjustable sum below for the Work, unless otherwise agreed in writing by both parties.',
        ),
        {
          kind: 'price',
          label: 'Contract Price',
          value: formatEtb(d.contractValueEtb),
          words: amountInWords(d.contractValueEtb),
        },
      ],
    },
    {
      number: 5,
      title: 'Terms of Payment',
      blocks: [
        instalments.length > 0
          ? instalmentTable(instalments, d.contractValueEtb)
          : {
              kind: 'clause',
              text: 'Payment falls due as stated in the attached proforma.',
            },
        ...numbered(5, [
          d.advanceGuaranteeRequired
            ? 'The advance payment is released only against a guarantee cheque from the Supplier of equal value.'
            : null,
          'The Supplier manages customs clearance. Any delay in payment by the Client entitles the Supplier to claim the associated costs.',
        ]),
      ],
    },
    {
      number: 6,
      title: 'Warranty and Maintenance',
      blocks: numbered(6, [
        `Warranty: ${
          d.warrantyMonths == null
            ? 'as stated in the attached proforma'
            : `${months(d.warrantyMonths)} from the date of handover`
        }.`,
        d.freeMaintenanceMonths == null
          ? null
          : `Maintenance: ${months(d.freeMaintenanceMonths)} of monthly preventive service and emergency repairs at no charge to the Client, from the date of handover.`,
        'Exclusions: the warranty does not cover damage from power surges or unauthorised third-party intervention.',
      ]),
    },
    {
      number: 7,
      title: 'Penalties and Remedies',
      blocks: clauses(
        d.delayPenaltyPercentPerDay == null
          ? '7.1 Delay: if the Supplier fails to hand over within the agreed period, the parties shall agree a remedy in writing.'
          : `7.1 Delay: if the Supplier fails to hand over within the agreed period, the Client may deduct ${pct(d.delayPenaltyPercentPerDay)} of the Contract Price for each day of delay${
              d.delayPenaltyCapPercent == null
                ? ''
                : `, up to a maximum of ${pct(d.delayPenaltyCapPercent)}`
            }.`,
        "7.2 Non-payment: if the Client defaults on a payment, the Supplier may suspend the Work only after fifteen (15) days' written notice.",
      ),
    },
    {
      number: 8,
      title: 'Dispute Resolution',
      blocks: clauses(
        '8.1 Governing law: this Contract is governed by the laws of the Federal Democratic Republic of Ethiopia.',
        `8.2 Any dispute that cannot be settled amicably shall be referred to ${
          d.disputeForum || 'the competent court'
        }.`,
      ),
    },
    ...(d.termsAndConditions
      ? [
          {
            number: 9,
            title: 'Additional Terms',
            blocks: [
              {
                kind: 'note',
                text: d.termsAndConditions,
                preWrap: true,
              } as const,
            ],
          },
        ]
      : []),
  ];

  return {
    documentTitle: isDraft ? 'CONTRACT DRAFT' : 'CONTRACT',
    coverLines: ['Between', d.projectName, 'and', supplier],
    footerNote: isDraft
      ? 'DRAFT for review — not binding until signed by both parties. Amounts in ETB.'
      : 'Signed by both parties. One copy for the Client, one retained by the Supplier. Amounts in ETB.',
    plate: [
      { label: 'Contract No.', value: d.contractNumber },
      { label: 'Project', value: d.projectName },
      // A draft is dated when it was drafted, never when it was "signed" —
      // but it IS dated: an undated page invites someone to write a date in.
      isDraft
        ? { label: 'Drafted', value: fmtDate(d.issuedAt) }
        : { label: 'Signed', value: fmtDate(d.signedAt) },
      { label: 'Status', value: d.status },
    ],
    parties: [
      {
        role: 'The Client',
        name: d.projectName,
        lines: partyLines(d.customer),
      },
      {
        role: 'The Supplier',
        name: supplier,
        lines: partyLines({
          address: branding?.address ?? null,
          phone: branding?.phones?.[0] ?? null,
          tin: branding?.taxId ?? null,
        }),
      },
    ],
    introduction: `This Contract Agreement is made between ${d.projectName} (the "Client") and ${supplier} (the "Supplier") for the supply, installation, testing and commissioning of the equipment described below at ${d.projectName}${
      isDraft
        ? '. This is a DRAFT for review and is not binding on either party until signed by both.'
        : `, and was signed by both parties on ${fmtDate(d.signedAt)}.`
    }`,
    articles,
    signatures: [
      [
        { caption: 'For the Client', lines: [d.projectName] },
        { caption: 'For the Supplier', lines: [branding?.name] },
      ],
      [{ caption: 'Witness 1' }, { caption: 'Witness 2' }],
    ],
  };
};

const renderBlock = (block: ContractBlock): string => {
  switch (block.kind) {
    case 'clause':
      return `<p class="prose">${esc(block.text)}</p>`;
    case 'note':
      return `<div class="notes"${block.preWrap ? ' style="white-space:pre-wrap"' : ''}>${esc(block.text)}</div>`;
    case 'table':
      return `<table class="lines"><thead><tr>${block.columns
        .map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.header)}</th>`)
        .join('')}</tr></thead><tbody>${block.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell, i) =>
                  `<td${block.columns[i]?.num ? ' class="num"' : ''}>${esc(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody></table>`;
    case 'price':
      return `<div class="sum-block"><table class="totals"><tbody>
    <tr class="grand"><td>${esc(block.label)}</td><td class="num">${esc(block.value)}</td></tr>
    <tr><td colspan="2">${esc(block.words)}</td></tr>
    </tbody></table></div>`;
  }
};

const renderParty = (p: ContractParty): string =>
  `<td><div class="plate-label">${esc(p.role)}</div><div class="party-name">${esc(p.name)}</div>${p.lines
    .map((line) => `<div class="party-line">${esc(line)}</div>`)
    .join('')}</td>`;

/** Build the branded contract HTML document from contractContent. Pure — no I/O — and every field is escaped. */
export const buildContractHtml = (
  data: object,
  branding: TenantBranding | null,
): string => {
  const c = contractContent(data as ContractTemplateData, branding);
  const bodyHtml = `
  ${renderReferencePlate(c.plate)}

  <table class="parties"><tbody><tr>
    ${renderParty(c.parties[0])}
    ${renderParty(c.parties[1])}
  </tr></tbody></table>

  <div class="notes">${esc(c.introduction)}</div>

  ${c.articles
    .map(
      (a) =>
        `<h2>Article ${a.number}: ${esc(a.title)}</h2>${a.blocks.map(renderBlock).join('')}`,
    )
    .join('\n  ')}

  ${c.signatures.map(([left, right]) => renderSignaturePair(left, right)).join('\n  ')}`;

  return renderLayout({
    branding,
    documentTitle: c.documentTitle,
    coverLines: c.coverLines,
    bodyHtml,
    footerNote: c.footerNote,
  });
};
