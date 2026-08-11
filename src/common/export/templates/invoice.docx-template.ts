import {
  AlignmentType,
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  FISCAL_NOTICE_TEXT,
  type FiscalMirrorFields,
  type InvoiceLineData,
  type InvoiceTemplateData,
} from './invoice.template';
import { sanitizeHex } from './layout';
import { formatEtb } from './money-format';
import { fullWidthTable, heading, row } from './quotation.docx-template';
import { fmtDate } from './quotation.template';

export { formatEtb };

const lineCell = (
  text: string,
  width: number,
  align?: (typeof AlignmentType)[keyof typeof AlignmentType],
): TableCell =>
  new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ alignment: align, children: [new TextRun(text)] })],
  });

/** 4-column line-items row — quotation.docx-template.ts's `row()` is fixed at 2 columns, so this file owns its own. */
const lineItemsRow = (
  description: string,
  quantity: string,
  unitPrice: string,
  lineTotal: string,
): TableRow =>
  new TableRow({
    children: [
      lineCell(description, 40),
      lineCell(quantity, 20, AlignmentType.RIGHT),
      lineCell(unitPrice, 20, AlignmentType.RIGHT),
      lineCell(lineTotal, 20, AlignmentType.RIGHT),
    ],
  });

const lineItemsHeaderRow = (): TableRow =>
  new TableRow({
    children: [
      new TableCell({
        width: { size: 40, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true })] })],
      }),
      new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Qty', bold: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Unit Price', bold: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Line Total', bold: true })],
          }),
        ],
      }),
    ],
  });

/**
 * Docx mirror of buildFiscalStatusHtml (invoice.template.ts) — same
 * conditional logic; see that file's compliance doc comment for the rule
 * being enforced (decisions doc §4). Exported so receipt.docx-template.ts
 * reuses this instead of re-deriving its own copy.
 */
export const buildFiscalStatusParagraphs = (
  fiscal: FiscalMirrorFields | null | undefined,
  primary: string,
): Paragraph[] => {
  if (!fiscal?.fiscalReceiptNumber) {
    return [
      new Paragraph({
        spacing: { before: 200, after: 200 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: FISCAL_NOTICE_TEXT, bold: true, color: primary })],
      }),
    ];
  }
  const lines = [
    `Fiscal receipt ${fiscal.fiscalReceiptNumber} issued ${fmtDate(fiscal.fiscalIssuedAt)} — device ${fiscal.fiscalDeviceSerial ?? '—'}`,
    ...(fiscal.fiscalKind ? [fiscal.fiscalKind] : []),
    ...(fiscal.fiscalNote ? [fiscal.fiscalNote] : []),
    'mirrored from the certified device',
  ];
  return lines.map(
    (text) =>
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text, size: 20, color: '333333' })],
      }),
  );
};

/**
 * Builds the invoice as a native docx `Document` — mirrors
 * invoice.template.ts's section shell (letterhead, meta, items, fiscal
 * notice/mirror, totals, footer). See that file's doc comment for why the
 * fiscal block sits directly above the totals table.
 */
export const buildInvoiceDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as InvoiceTemplateData;
  const primary = sanitizeHex(branding?.primaryColor);

  const itemRows: TableRow[] = d.lines.length
    ? d.lines.map((l: InvoiceLineData) =>
        lineItemsRow(l.description, l.quantity, formatEtb(l.unitPriceEtb), formatEtb(l.lineTotalEtb)),
      )
    : [lineItemsRow('No line items', '', '', formatEtb(null))];

  const phones = (branding?.phones ?? []).filter(Boolean).join(' · ');
  const footerLine = [branding?.address, phones].filter(Boolean).join(' · ');

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: branding?.name ?? '', bold: true, size: 32, color: primary })],
    }),
    ...(branding?.slogan
      ? [
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: branding.slogan, italics: true, color: '666666', size: 20 }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { before: 120, after: 200 },
      children: [
        new TextRun({ text: 'INVOICE', bold: true, size: 32, color: primary }),
        new TextRun({ text: `   ${d.status}`, bold: true, size: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(
          `Invoice No.: ${d.invoiceNumber}    Issued: ${fmtDate(d.issuedAt)}    Due: ${fmtDate(d.dueDate)}`,
        ),
      ],
    }),
    heading('Billed To', primary),
    new Paragraph({ children: [new TextRun({ text: d.customerName, bold: true })] }),
    ...(d.projectName
      ? [new Paragraph({ children: [new TextRun(`Project: ${d.projectName}`)] })]
      : []),
    heading('Items', primary),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [lineItemsHeaderRow(), ...itemRows] }),
    ...buildFiscalStatusParagraphs(d, primary),
    heading('Totals', primary),
    fullWidthTable([
      row('Subtotal', formatEtb(d.subtotalEtb)),
      row(`VAT (${d.taxPercent ?? '0'}%)`, formatEtb(d.vatEtb)),
      row('Total', formatEtb(d.totalEtb)),
      ...(d.hasWithholding
        ? [
            row(
              `Withholding retained by customer (voucher ${d.whtVoucherRef ?? '—'})`,
              formatEtb(d.whtDeductionEtb),
            ),
            row('Net cash due', formatEtb(d.netCashDueEtb)),
          ]
        : []),
    ]),
    new Paragraph({
      spacing: { before: 400 },
      children: [new TextRun({ text: footerLine, size: 18, color: '888888' })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: d.dueDate ? `Payment due by ${fmtDate(d.dueDate)}. Prices in ETB.` : 'Prices in ETB.',
          size: 18,
          color: '888888',
        }),
      ],
    }),
  ];

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Noto Sans Ethiopic' },
            size: 22,
          },
        },
      },
    },
    sections: [{ children: body }],
  });
};
