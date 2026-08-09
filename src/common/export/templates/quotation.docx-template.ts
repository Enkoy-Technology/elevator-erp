import {
  AlignmentType,
  Document,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { sanitizeHex } from './layout';
import { fmtDate, PRICING_ROWS, TECH_ROWS, type QuotationTemplateData } from './quotation.template';

/**
 * Money strings land in text runs verbatim — never passed through Number()
 * (per the brief's money rule for this renderer). This is deliberately
 * simpler than quotation.template.ts's formatEtb, which adds thousands
 * separators via Intl.NumberFormat(Number(value)) for the PDF; the Word
 * output shows the raw decimal string instead (e.g. "143750.00 ETB" rather
 * than "143,750.00 ETB").
 */
const money = (value: string | null | undefined): string => `${value ?? '0.00'} ETB`;

const cell = (
  text: string,
  { width, align }: { width: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] },
): TableCell =>
  new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ alignment: align, children: [new TextRun(text)] })],
  });

/** Two-column label/value row, value right-aligned (mirrors the PDF's `td.num`). */
const row = (label: string, value: string): TableRow =>
  new TableRow({
    children: [cell(label, { width: 65 }), cell(value, { width: 35, align: AlignmentType.RIGHT })],
  });

const fullWidthTable = (rows: readonly TableRow[]): Table =>
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

const heading = (text: string, color: string): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, color })],
  });

/**
 * Builds the quotation as a native docx `Document` model — mirrors
 * quotation.template.ts's sections (letterhead, meta, technical spec table,
 * pricing table, totals, notes, footer) as directly as the two formats
 * allow. No HTML-escaping needed: docx builds a document object model, not
 * markup, so there is no injection surface to sanitize against here.
 *
 * Logo intentionally omitted: `branding.logoUrl` can be a remote https URL,
 * and `docx`'s ImageRun needs an in-memory buffer — fetching it would add
 * HTTP I/O to a pure renderer (explicitly out of scope per the brief). Word
 * output is text-letterhead-only for every tenant, not just those with a
 * remote logo, so there is one code path instead of a conditional one.
 */
export const buildQuotationDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as QuotationTemplateData;
  const pricing = d.pricingBreakdown ?? {};
  const tech = d.technicalSpec ?? {};
  const primary = sanitizeHex(branding?.primaryColor);

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null).map((r) =>
    row(r.label, `${String(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}`),
  );
  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null).map((r) =>
    row(r.label, money(pricing[r.key])),
  );

  const phones = (branding?.phones ?? []).filter(Boolean).join(' · ');
  const footerLine = [branding?.address, phones].filter(Boolean).join(' · ');

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      children: [
        new TextRun({ text: branding?.name ?? '', bold: true, size: 32, color: primary }),
      ],
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
        new TextRun({ text: 'QUOTATION', bold: true, size: 32, color: primary }),
        new TextRun({ text: `   ${d.status}`, bold: true, size: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(
          `Quote No.: ${d.quoteNumber}    Issued: ${fmtDate(d.createdAt)}    Valid Until: ${fmtDate(d.validUntil)}`,
        ),
      ],
    }),
    heading('Prepared For', primary),
    new Paragraph({ children: [new TextRun({ text: d.customerName, bold: true })] }),
    new Paragraph({ children: [new TextRun(`Project: ${d.projectName}`)] }),
    heading('Technical Specification', primary),
    fullWidthTable(techRows.length ? techRows : [row('See attached specification', '')]),
    heading('Pricing', primary),
    // docx's Table rejects a zero-row table (unlike an empty HTML <table>,
    // which the PDF template tolerates silently) — fall back to a single
    // placeholder row rather than let an unfunded quote crash the render.
    fullWidthTable(pricingRows.length ? pricingRows : [row('See pricing breakdown', '')]),
    heading('Totals', primary),
    fullWidthTable([
      row('Subtotal', money(d.subtotalEtb)),
      row(`Margin (${d.marginPercent ?? '0'}%)`, money(d.marginAmountEtb)),
      row(`Tax (${d.taxPercent ?? '0'}%)`, money(d.taxAmountEtb)),
      row('Total', money(d.totalPriceEtb)),
    ]),
    ...(d.notes
      ? [heading('Notes', primary), new Paragraph({ children: [new TextRun(d.notes)] })]
      : []),
    new Paragraph({
      spacing: { before: 400 },
      children: [new TextRun({ text: footerLine, size: 18, color: '888888' })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `This quotation is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
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
          // Word has no font-embedding path analogous to the PDF's base64
          // @font-face — Amharic fidelity here depends on the opening
          // machine having Noto Sans Ethiopic installed. `cs` (complex
          // script) is the rFonts bucket Word associates with non-Latin,
          // non-CJK scripts including Ethiopic; `ascii`/`hAnsi` cover Latin
          // text with a standard, always-available font.
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
