import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
} from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { sanitizeHex, type DocumentBranding } from './layout';

/**
 * Word-side twin of layout.ts: the letterhead, reference plate, party
 * blocks, signature block, page geometry and footer that every docx
 * template shares, so the four builders describe only what makes their own
 * document different. Same colour rule as the PDF layout — the tenant's
 * primaryColor is only ever a RULE or a SHADED FILL behind near-black text,
 * never the text colour itself (the client's brand is #FB9D19; coloured text
 * of it on white is unreadable in print).
 */

/** Near-black body ink and the two greys, as docx wants them: 6 hex digits, no '#'. */
export const INK = '14120E';
const SOFT = '5B554C';
const RULE = 'D9D4CC';
const TINT = 'F2F0EC';

/** A4 with real margins: 15mm sides/top, 18mm bottom (1440 twips = 1 inch). */
const PAGE_MARGIN = { top: 850, right: 850, bottom: 1020, left: 850, footer: 510 };

/** A tenant colour as docx wants it: 6 hex digits, no leading '#', brand default when unset/invalid. */
export const hexOf = (value: string | null | undefined): string =>
  sanitizeHex(value).replace('#', '');

/** One border edge. `size` is eighths of a point: 4 ≈ hairline, 18 ≈ 2.25pt. */
export const border = (color: string, size: number): IBorderOptions => ({
  style: BorderStyle.SINGLE,
  size,
  color,
  space: 1,
});

const plateLabel = (text: string): Paragraph =>
  new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: text.toUpperCase(), size: 13, color: SOFT, bold: true })],
  });

const cell = (
  text: string,
  { width, align }: { width: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] },
): TableCell =>
  new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ alignment: align, children: [new TextRun(text)] })],
  });

/** Two-column label/value row, value right-aligned (mirrors the PDF's `td.num`). */
export const row = (text: string, value: string): TableRow =>
  new TableRow({
    children: [cell(text, { width: 65 }), cell(value, { width: 35, align: AlignmentType.RIGHT })],
  });

/** The same row, shaded and bold: the one figure that matters (grand total). */
export const grandRow = (text: string, value: string): TableRow =>
  new TableRow({
    children: [
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        shading: { fill: TINT },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
      }),
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: { fill: TINT },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: value, bold: true })],
          }),
        ],
      }),
    ],
  });

/** A plain body paragraph (notes, an amount in words). */
export const textBlock = (text: string, italics = false): Paragraph =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, italics })] });

export const fullWidthTable = (rows: readonly TableRow[]): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border(INK, 6),
      bottom: border(INK, 6),
      left: border(RULE, 4),
      right: border(RULE, 4),
      insideHorizontal: border(RULE, 4),
      insideVertical: border(RULE, 4),
    },
    rows,
  });

/** Section heading: black text on a primary rule — never coloured text. */
export const heading = (text: string, primary: string | null | undefined): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    border: { bottom: border(hexOf(primary), 12) },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: INK })],
  });

/** One cell of the reference plate. */
export interface DocxReferenceField {
  label: string;
  value: string;
}

/** The document's identity block — the Word twin of the PDF's load plate. */
export const plateTable = (
  fields: readonly DocxReferenceField[],
  primary: string | null | undefined,
): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border(hexOf(primary), 18),
      bottom: border(INK, 6),
      left: border(INK, 6),
      right: border(INK, 6),
      insideHorizontal: border(RULE, 4),
      insideVertical: border(RULE, 4),
    },
    rows: [
      new TableRow({
        children: fields.map(
          (f) =>
            new TableCell({
              width: { size: Math.floor(100 / fields.length), type: WidthType.PERCENTAGE },
              children: [
                plateLabel(f.label),
                new Paragraph({ children: [new TextRun({ text: f.value, bold: true, size: 22 })] }),
              ],
            }),
        ),
      }),
    ],
  });

/** From / to — who issued the document and who it is addressed to. */
export const partiesTable = (
  branding: TenantBranding | null,
  to: { label: string; lines: readonly string[] },
): Table => {
  const column = (title: string, lines: readonly string[]): TableCell =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        plateLabel(title),
        ...lines
          .filter(Boolean)
          .map((line, i) =>
            new Paragraph({
              children: [new TextRun({ text: line, bold: i === 0, color: i === 0 ? INK : SOFT })],
            }),
          ),
      ],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border(RULE, 4),
      bottom: border(RULE, 4),
      left: border(RULE, 4),
      right: border(RULE, 4),
      insideHorizontal: border(RULE, 4),
      insideVertical: border(RULE, 4),
    },
    rows: [
      new TableRow({
        children: [
          column('From', [branding?.name ?? '', ...(branding?.address ? [branding.address] : [])]),
          column(to.label, to.lines),
        ],
      }),
    ],
  });
};

/**
 * Signature block. The Word format carries the ruled signature line only —
 * `branding.stampUrl` is deliberately NOT embedded here for the same reason
 * the logo isn't (docx's ImageRun needs an in-memory buffer, and these
 * builders are pure/synchronous with no HTTP I/O); the PDF, which is the
 * format that gets printed, does render the seal.
 */
export const signatureTable = (
  branding: TenantBranding | null,
  caption = 'Authorized signature',
): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 55, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { before: 700 },
                border: { bottom: border(INK, 6) },
                children: [new TextRun('')],
              }),
              new Paragraph({
                children: [new TextRun({ text: caption, size: 16, color: SOFT })],
              }),
              ...(branding?.name
                ? [
                    new Paragraph({
                      children: [
                        new TextRun({ text: `for ${branding.name}`, size: 16, color: SOFT }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun('')] })],
          }),
        ],
      }),
    ],
  });

export interface DocxDocumentOptions {
  branding: TenantBranding | null;
  /** e.g. "QUOTATION" — set as the black display line under the letterhead rule. */
  documentTitle: string;
  /** Line in the page footer under the contact strip, e.g. a validity notice. */
  footerNote: string;
  /** The document's own sections, between the party blocks and the signature. */
  children: readonly (Paragraph | Table)[];
}

/**
 * Assembles the whole Word document: letterhead, title, the caller's body,
 * and a real page footer (contact strip + "Page X of Y") on A4 with proper
 * margins. Every docx template goes through here so the four formats stay
 * one letterhead, not four.
 */
export const buildDocxDocument = (opts: DocxDocumentOptions): Document => {
  const { branding, documentTitle, footerNote, children } = opts;
  const b: DocumentBranding | null = branding;
  const primary = hexOf(b?.primaryColor);
  const contact = [b?.address, (b?.phones ?? []).filter(Boolean).join(' · '), b?.email]
    .filter(Boolean)
    .join(' · ');

  const letterhead: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: b?.name ?? '', bold: true, size: 32, color: INK })],
    }),
    ...(b?.slogan
      ? [
          new Paragraph({
            children: [new TextRun({ text: b.slogan, size: 18, color: SOFT })],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: border(primary, 18) },
      children: [new TextRun({ text: contact, size: 16, color: SOFT })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: documentTitle, bold: true, size: 32, color: INK }),
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
            size: 20,
            color: INK,
          },
          paragraph: { spacing: { line: 264 } },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: PAGE_MARGIN } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: border(RULE, 4) },
                children: [new TextRun({ text: contact, size: 14, color: SOFT })],
              }),
              new Paragraph({
                children: [new TextRun({ text: footerNote, size: 14, color: SOFT })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Page ', size: 14, color: SOFT }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: SOFT }),
                  new TextRun({ text: ' of ', size: 14, color: SOFT }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: SOFT }),
                ],
              }),
            ],
          }),
        },
        children: [...letterhead, ...children],
      },
    ],
  });
};
