import {
  AlignmentType,
  type Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  border,
  buildDocxDocument,
  fullWidthTable,
  grandRow,
  heading,
  hexOf,
  INK,
  partiesTable,
  plateTable,
  row,
  signatureTable,
} from './docx-layout';
import {
  FISCAL_NOTICE_TEXT,
  type FiscalMirrorFields,
  type InvoiceLineData,
  type InvoiceTemplateData,
} from './invoice.template';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';

export { formatEtb };

const LINE_WIDTHS = [40, 15, 22, 23] as const;

const lineCell = (
  text: string,
  width: number,
  { align, bold, shaded }: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; shaded?: boolean } = {},
): TableCell =>
  new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    ...(shaded ? { shading: { fill: 'F2F0EC' } } : {}),
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold })] })],
  });

/** 4-column line-items row — docx-layout's `row()` is fixed at 2 columns, so this file owns its own. */
const lineItemsRow = (cells: readonly [string, string, string, string]): TableRow =>
  new TableRow({
    children: [
      lineCell(cells[0], LINE_WIDTHS[0]),
      lineCell(cells[1], LINE_WIDTHS[1], { align: AlignmentType.RIGHT }),
      lineCell(cells[2], LINE_WIDTHS[2], { align: AlignmentType.RIGHT }),
      lineCell(cells[3], LINE_WIDTHS[3], { align: AlignmentType.RIGHT }),
    ],
  });

/** `tableHeader: true` makes Word repeat this row at the top of every page the table spans. */
const lineItemsHeaderRow = (): TableRow =>
  new TableRow({
    tableHeader: true,
    children: [
      lineCell('DESCRIPTION', LINE_WIDTHS[0], { bold: true, shaded: true }),
      lineCell('QTY', LINE_WIDTHS[1], { align: AlignmentType.RIGHT, bold: true, shaded: true }),
      lineCell('UNIT PRICE', LINE_WIDTHS[2], { align: AlignmentType.RIGHT, bold: true, shaded: true }),
      lineCell('LINE TOTAL', LINE_WIDTHS[3], { align: AlignmentType.RIGHT, bold: true, shaded: true }),
    ],
  });

/**
 * Docx mirror of buildFiscalStatusHtml (invoice.template.ts) — same
 * conditional logic; see that file's compliance doc comment for the rule
 * being enforced (decisions doc §4). Exported so receipt.docx-template.ts
 * reuses this instead of re-deriving its own copy. The notice is framed by
 * the tenant's accent colour but SET IN BLACK: the accent is a rule, never
 * the text colour (see docx-layout.ts).
 */
export const buildFiscalStatusParagraphs = (
  fiscal: FiscalMirrorFields | null | undefined,
  primary: string,
): Paragraph[] => {
  const accent = hexOf(primary);
  if (!fiscal?.fiscalReceiptNumber) {
    return [
      new Paragraph({
        spacing: { before: 240, after: 240 },
        alignment: AlignmentType.CENTER,
        border: {
          top: border(accent, 12),
          bottom: border(accent, 12),
          left: border(accent, 12),
          right: border(accent, 12),
        },
        children: [new TextRun({ text: FISCAL_NOTICE_TEXT, bold: true, color: INK })],
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
    (text, i) =>
      new Paragraph({
        spacing: { before: i === 0 ? 240 : 0, after: 60 },
        border: { left: border(accent, 18) },
        children: [new TextRun({ text, size: 18, color: INK })],
      }),
  );
};

/**
 * Builds the invoice as a native docx `Document` — mirrors
 * invoice.template.ts's section shell (letterhead, reference plate, party
 * blocks, items, fiscal notice/mirror, totals, signature, footer) through
 * the shared docx-layout.ts shell. See invoice.template.ts's doc comment
 * for why the fiscal block sits directly above the totals table.
 */
export const buildInvoiceDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as InvoiceTemplateData;
  const primary = branding?.primaryColor ?? null;

  const itemRows: TableRow[] = d.lines.length
    ? d.lines.map((l: InvoiceLineData) =>
        lineItemsRow([
          l.description,
          l.quantity,
          formatEtb(l.unitPriceEtb),
          formatEtb(l.lineTotalEtb),
        ]),
      )
    : [lineItemsRow(['No line items', '', '', formatEtb(null)])];

  const children: (Paragraph | Table)[] = [
    plateTable(
      [
        { label: 'Invoice No.', value: d.invoiceNumber },
        { label: 'Issued', value: fmtDate(d.issuedAt) },
        { label: 'Due', value: fmtDate(d.dueDate) },
        { label: 'Status', value: d.status },
      ],
      primary,
    ),
    partiesTable(branding, {
      label: 'Billed To',
      lines: [d.customerName, ...(d.projectName ? [`Project: ${d.projectName}`] : [])],
    }),
    heading('Items', primary),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [lineItemsHeaderRow(), ...itemRows],
    }),
    ...buildFiscalStatusParagraphs(d, primary ?? ''),
    heading('Totals', primary),
    fullWidthTable([
      row('Subtotal', formatEtb(d.subtotalEtb)),
      row(`VAT (${d.taxPercent ?? '0'}%)`, formatEtb(d.vatEtb)),
      grandRow('Total', formatEtb(d.totalEtb)),
      ...(d.hasWithholding
        ? [
            row(
              `Withholding retained by customer (voucher ${d.whtVoucherRef ?? '—'})`,
              formatEtb(d.whtDeductionEtb),
            ),
            grandRow('Net cash due', formatEtb(d.netCashDueEtb)),
          ]
        : []),
    ]),
    signatureTable(branding),
  ];

  return buildDocxDocument({
    branding,
    documentTitle: 'INVOICE',
    footerNote: d.dueDate
      ? `Payment due by ${fmtDate(d.dueDate)}. Prices in ETB.`
      : 'Prices in ETB.',
    children,
  });
};
