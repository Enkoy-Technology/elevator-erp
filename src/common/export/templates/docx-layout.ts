import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlignSection,
  VerticalAlignTable,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type IBorderOptions,
  type ISectionOptions,
} from 'docx';

import { LETTERHEAD_LOGO_DATA_URI } from '../assets/letterhead-logo';
import { readInlineImage, type InlineImage } from '../inline-image';
import type { TenantBranding } from '../document-pdf.service';
import { sanitizeHex, type DocumentBranding, type PartyBlock } from './layout';

/**
 * Word-side twin of layout.ts, set to the same page: A4 with the PDF's
 * margins, the letterhead logo centred in the top band, the address and
 * page number in the bottom band, the tenant's watermark behind every page,
 * and the cover page, reference plate, party blocks, section headings,
 * tables, totals and signatures sized and coloured as the PDF's stylesheet
 * sets them (client, 2026-10-30: the Word files did not look like the PDF).
 * Sizes are layout.ts's CSS pixels converted here, once, so a template
 * never carries a docx unit of its own.
 *
 * Same colour rule as the PDF: the tenant's primaryColor is only ever a
 * rule, a border or a pale tint behind near-black text.
 *
 * Images are embedded only from data: URIs (the letterhead ships as one,
 * and the settings screen stores the watermark and seal as one); the
 * builders stay pure, with no HTTP to make.
 */

export const INK = '14120E';
export const SOFT = '5B554C';
export const RULE = 'D9D4CC';
/** The parties' off-white and the even-row zebra. */
const PAPER = 'FCFBF9';
const ZEBRA = 'FBFAF8';

/** Millimetres to twips (1/20 pt). */
const mm = (n: number): number => Math.round((n * 1440) / 25.4);
/** A CSS pixel size as docx half-points (1px = 0.75pt). */
const px = (n: number): number => Math.round(n * 1.5);
/** A CSS pixel length as twips. */
const pxTw = (n: number): number => Math.round(n * 15);

/** layout.ts's `@page { size: A4; margin: 34mm 18mm 20mm }`. */
const PAGE = {
  size: { width: mm(210), height: mm(297) },
  margin: {
    top: mm(34),
    right: mm(18),
    bottom: mm(20),
    left: mm(18),
    header: mm(9),
    footer: mm(7),
  },
};
/** The printable width every full-width table is laid out to. */
export const CONTENT_WIDTH = mm(210 - 36);

const MONO = 'Courier New';
const BODY_SIZE = px(11);
/** CSS line-height 1.65 over Arial's own 1.15 line. */
const BODY_LINE = Math.round((1.65 / 1.15) * 240);

/** A tenant colour as docx wants it: 6 hex digits, no leading '#', brand default when unset/invalid. */
export const hexOf = (value: string | null | undefined): string =>
  sanitizeHex(value).replace('#', '').toUpperCase();

/** `color-mix(in srgb, primary pct%, white)`, as the PDF tints. */
const tintOf = (hex: string, pct: number): string =>
  [0, 2, 4]
    .map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16);
      return Math.round(c * (pct / 100) + 255 * (1 - pct / 100))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')
    .toUpperCase();

/** The tenant's colour and the two tints the PDF mixes from it. */
export interface DocxPalette {
  primary: string;
  tint: string;
  tintStrong: string;
}

export const paletteOf = (branding: TenantBranding | null): DocxPalette => {
  const primary = hexOf(branding?.primaryColor);
  return {
    primary,
    tint: tintOf(primary, 9),
    tintStrong: tintOf(primary, 18),
  };
};

/** One border edge. `size` is eighths of a point: 6 ≈ 1px, 18 ≈ 3px. */
export const border = (color: string, size: number): IBorderOptions => ({
  style: BorderStyle.SINGLE,
  size,
  color,
  space: 0,
});

const NONE: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'auto',
};
const NO_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
  insideHorizontal: NONE,
  insideVertical: NONE,
};

export type Block = Paragraph | Table;

interface RunStyle {
  bold?: boolean;
  size?: number;
  color?: string;
  mono?: boolean;
  caps?: boolean;
  /** CSS letter-spacing, in px. */
  tracking?: number;
}

/** A run of text in the document's own type: Arial (the PDF's Liberation Sans is its metric twin). */
export const run = (text: string, style: RunStyle = {}): TextRun =>
  new TextRun({
    text: style.caps ? text.toUpperCase() : text,
    bold: style.bold,
    size: style.size ?? BODY_SIZE,
    color: style.color ?? INK,
    ...(style.mono ? { font: MONO } : {}),
    ...(style.tracking ? { characterSpacing: pxTw(style.tracking) } : {}),
  });

const para = (
  children: TextRun[],
  opts: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
  } = {},
): Paragraph =>
  new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    children,
  });

/** `.plate-label`: 8px, uppercase, soft. */
const label = (text: string): Paragraph =>
  para([run(text, { size: px(8), color: SOFT, caps: true })], {
    after: pxTw(3),
  });

/** Fractions of the width to twips that add up to exactly `total`. */
const widths = (fractions: readonly number[], total: number): number[] => {
  const sum = fractions.reduce((a, b) => a + b, 0);
  const out = fractions.map((f) => Math.floor((f / sum) * total));
  out[out.length - 1]! += total - out.reduce((a, b) => a + b, 0);
  return out;
};

const cellMargins = (v: number, h: number) => ({
  top: pxTw(v),
  bottom: pxTw(v),
  left: pxTw(h),
  right: pxTw(h),
});

// ---- images --------------------------------------------------------

/**
 * An image Word can embed: a PNG or JPEG data: URI with a real size. The
 * tenant's watermark and seal arrive here already re-encoded as PNG by
 * DocumentPdfService.fadeImage (see DocumentDocxService).
 */
const embeddable = (uri: string | null | undefined): InlineImage | null => {
  const image = readInlineImage(uri);
  return image &&
    (image.type === 'png' || image.type === 'jpg') &&
    image.width > 0 &&
    image.height > 0
    ? image
    : null;
};

/** The letterhead, decoded once. */
const LETTERHEAD = embeddable(LETTERHEAD_LOGO_DATA_URI);

/** CSS px at 96 dpi, which is what docx's image transformation takes. */
const mmPx = (n: number): number => (n / 25.4) * 96;

/**
 * Scaled to fit inside a box, keeping its shape. `enlarge: false` is CSS
 * max-width/max-height, which never makes an image bigger than it is.
 */
const fit = (
  image: InlineImage,
  maxWmm: number,
  maxHmm: number,
  enlarge = false,
) => {
  const scale = Math.min(
    mmPx(maxWmm) / image.width,
    mmPx(maxHmm) / image.height,
    enlarge ? Infinity : 1,
  );
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  };
};

// ---- blocks --------------------------------------------------------

/** `h2`: 10px uppercase on a 2px brand rule, 28px above and 10px below. */
export const heading = (
  text: string,
  palette: DocxPalette,
  opts: { pageBreakBefore?: boolean } = {},
): Paragraph => {
  const paragraph = new Paragraph({
    keepNext: true,
    pageBreakBefore: opts.pageBreakBefore,
    spacing: { before: opts.pageBreakBefore ? 0 : pxTw(28), after: pxTw(10) },
    border: { bottom: { ...border(palette.primary, 12), space: 3 } },
    children: [run(text, { bold: true, size: px(10), caps: true })],
  });
  HEADINGS.add(paragraph);
  return paragraph;
};

/** `.prose`: the tenant's own paragraphing kept, line for line (white-space: pre-line). */
export const prose = (
  text: string,
  opts: { before?: number; pageBreakBefore?: boolean } = {},
): Paragraph => {
  const build = (after: number) => proseParagraph(text, { ...opts, after });
  const paragraph = build(pxTw(8));
  PROSE.set(paragraph, build);
  return paragraph;
};

const proseParagraph = (
  text: string,
  opts: { before?: number; pageBreakBefore?: boolean; after: number },
): Paragraph =>
  new Paragraph({
    pageBreakBefore: opts.pageBreakBefore,
    spacing: { before: opts.before ?? 0, after: opts.after },
    children: text.split(/\r?\n/).map(
      (line, i) =>
        new TextRun({
          text: line,
          size: BODY_SIZE,
          color: INK,
          ...(i > 0 ? { break: 1 } : {}),
        }),
    ),
  });

/** `.fineprint`: 8.5px soft type. */
export const fineprint = (text: string, before = pxTw(14)): Paragraph =>
  para([run(text, { size: px(8.5), color: SOFT })], { before });

/** One cell that holds the whole width: the boxes below are drawn as one. */
const box = (
  children: Paragraph[],
  opts: {
    fill: string;
    borders: Record<'top' | 'bottom' | 'left' | 'right', IBorderOptions>;
    margins: ReturnType<typeof cellMargins>;
    before?: number;
  },
): Table =>
  new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      // No cantSplit: a panel taller than the page room left (the contract's
      // additional terms) must run on to the next page, as the PDF's does,
      // not be cut off at the foot of this one.
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: opts.fill,
            },
            borders: opts.borders,
            margins: opts.margins,
            children,
          }),
        ],
      }),
    ],
  });

/** Space between blocks, which a table cannot carry itself. */
export const gap = (twips: number): Paragraph => {
  // A gap belongs to the block after it: a heading kept with its next
  // paragraph must not be parted from its table by the gap between them.
  const paragraph = new Paragraph({
    keepNext: true,
    spacing: {
      before: 0,
      after: 0,
      line: Math.max(twips, 20),
      lineRule: 'exact',
    },
    children: [new TextRun({ text: '', size: 2 })],
  });
  GAPS.set(paragraph, twips);
  return paragraph;
};

/**
 * The gaps, headings and prose built here, so buildDocxDocument can lay out
 * the space between blocks as the PDF's CSS does. Word adds one block's
 * space below to the next one's space above; CSS collapses the two
 * margins into the larger. The rules, block by block:
 * - two gaps in a row are the larger;
 * - a gap before a heading is the heading's own 28px;
 * - a gap after a heading is what it adds to the heading's 10px below;
 * - a prose paragraph's 8px below gives way to a heading or gap after it;
 * - prose straight after a table opens 12px down (`table + .prose`).
 */
const GAPS = new WeakMap<Paragraph, number>();
const HEADINGS = new WeakSet<Paragraph>();
const PROSE = new WeakMap<Paragraph, (after: number) => Paragraph>();
const HEADING_BELOW = pxTw(10);

export const collapseMargins = (blocks: readonly Block[]): Block[] =>
  blocks.reduce<Block[]>((out, block) => {
    const previous = out[out.length - 1];
    const blockGap = block instanceof Paragraph ? GAPS.get(block) : undefined;
    const blockIsHeading = block instanceof Paragraph && HEADINGS.has(block);
    if (previous instanceof Paragraph) {
      const previousGap = GAPS.get(previous);
      const rebuildProse = PROSE.get(previous);
      if (previousGap !== undefined && blockIsHeading) {
        out.pop();
      } else if (previousGap !== undefined && blockGap !== undefined) {
        if (blockGap < previousGap) {
          return out;
        }
        out.pop();
      } else if (HEADINGS.has(previous) && blockGap !== undefined) {
        if (blockGap > HEADING_BELOW) {
          out.push(gap(blockGap - HEADING_BELOW));
        }
        return out;
      } else if (rebuildProse && (blockIsHeading || blockGap !== undefined)) {
        out[out.length - 1] = rebuildProse(0);
      }
    } else if (previous instanceof Table && block instanceof Paragraph) {
      const rebuild = PROSE.get(block);
      if (rebuild) {
        out.push(gap(pxTw(12)));
      }
    }
    out.push(block);
    return out;
  }, []);

/**
 * `.notes`: a tinted panel ruled down its left in the brand colour. Its
 * lines run together as the PDF's do, unless the text keeps its own
 * (`white-space: pre-wrap`: the contract's scope and extra terms).
 */
export const notesBox = (
  text: string,
  palette: DocxPalette,
  opts: { preWrap?: boolean } = {},
): Block[] => [
  gap(pxTw(18)),
  box(
    [
      proseParagraph(opts.preWrap ? text : text.replace(/\s+/g, ' ').trim(), {
        after: 0,
      }),
    ],
    {
      fill: palette.tint,
      borders: {
        top: NONE,
        bottom: NONE,
        right: NONE,
        left: border(palette.primary, 18),
      },
      margins: cellMargins(10, 14),
    },
  ),
  gap(pxTw(18)),
];

/** `.fiscal-notice`: framed in the brand colour, bold, uppercase, centred. */
export const fiscalNotice = (text: string, palette: DocxPalette): Block[] => [
  gap(pxTw(14)),
  box(
    [
      para([run(text, { bold: true, caps: true })], {
        align: AlignmentType.CENTER,
      }),
    ],
    {
      fill: palette.tint,
      borders: {
        top: border(palette.primary, 12),
        bottom: border(palette.primary, 12),
        left: border(palette.primary, 12),
        right: border(palette.primary, 12),
      },
      margins: cellMargins(9, 14),
    },
  ),
  gap(pxTw(14)),
];

/** `.fiscal-mirror`: a tinted panel ruled down its left, smaller type. */
export const fiscalMirror = (
  lines: readonly string[],
  palette: DocxPalette,
): Block[] => [
  gap(pxTw(14)),
  box(
    lines.map((line) => para([run(line, { size: px(10) })])),
    {
      fill: palette.tint,
      borders: {
        top: NONE,
        bottom: NONE,
        right: NONE,
        left: border(palette.primary, 18),
      },
      margins: cellMargins(9, 14),
    },
  ),
  gap(pxTw(14)),
];

/** One cell of the reference plate. */
export interface DocxReferenceField {
  label: string;
  value: string;
}

/** The document's identity block — the PDF's load plate. */
export const plateTable = (
  fields: readonly DocxReferenceField[],
  palette: DocxPalette,
): Block[] => {
  const cols = widths(
    fields.map(() => 1),
    CONTENT_WIDTH,
  );
  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: cols,
      layout: TableLayoutType.FIXED,
      borders: {
        top: border(palette.primary, 18),
        bottom: border(INK, 6),
        left: border(INK, 6),
        right: border(INK, 6),
        insideHorizontal: NONE,
        insideVertical: border(RULE, 6),
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: fields.map(
            (f, i) =>
              new TableCell({
                width: { size: cols[i]!, type: WidthType.DXA },
                margins: cellMargins(9, 12),
                children: [
                  label(f.label),
                  para([
                    run(f.value, { bold: true, size: px(12), mono: true }),
                  ]),
                ],
              }),
          ),
        }),
      ],
    }),
    gap(pxTw(14)),
  ];
};

/** One column of a parties table: a label, the name in bold, then soft lines. */
export interface DocxPartyColumn {
  label: string;
  name: string;
  lines: readonly string[];
}

/** Two party columns, ruled and on the off-white the PDF gives them. */
export const partyColumns = (columns: readonly DocxPartyColumn[]): Block[] => {
  const cols = widths(
    columns.map(() => 1),
    CONTENT_WIDTH,
  );
  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: cols,
      layout: TableLayoutType.FIXED,
      borders: {
        top: border(RULE, 6),
        bottom: border(RULE, 6),
        left: border(RULE, 6),
        right: border(RULE, 6),
        insideHorizontal: border(RULE, 6),
        insideVertical: border(RULE, 6),
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: columns.map(
            (c, i) =>
              new TableCell({
                width: { size: cols[i]!, type: WidthType.DXA },
                shading: {
                  type: ShadingType.CLEAR,
                  color: 'auto',
                  fill: PAPER,
                },
                margins: cellMargins(10, 12),
                children: [
                  label(c.label),
                  para([run(c.name, { bold: true, size: px(12) })]),
                  ...c.lines
                    .filter(Boolean)
                    .map((line) => para([run(line, { color: SOFT })])),
                ],
              }),
          ),
        }),
      ],
    }),
    gap(pxTw(16)),
  ];
};

/** From (always the tenant, with its phones) and To — layout.ts's renderParties. */
export const partiesTable = (
  branding: TenantBranding | null,
  to: PartyBlock,
): Block[] => {
  const phones = (branding?.phones ?? []).filter(Boolean);
  const fromLines = [
    branding?.name ?? '',
    ...(branding?.address ? [branding.address] : []),
    ...(phones.length ? [`Tel: ${phones.join(' / ')}`] : []),
  ];
  const column = (party: PartyBlock): DocxPartyColumn => {
    const [name = '', ...rest] = party.lines.filter(Boolean);
    return { label: party.label, name, lines: rest };
  };
  return partyColumns([
    ...(fromLines.some(Boolean)
      ? [column({ label: 'From', lines: fromLines })]
      : []),
    column(to),
  ]);
};

/** A column of a data table. `num` sets it right and in the figures' mono face. */
export interface DocxColumn {
  header: string;
  width: number;
  num?: boolean;
}

/**
 * The PDF's ruled table: a tinted header row on an ink rule, hairlines under
 * every row, the even rows a shade off-white. `bold` sets a column's values
 * bold (the spec sheet's values column). A table with no header row is the
 * spec sheet and the terms table.
 */
export const dataTable = (
  columns: readonly DocxColumn[],
  rows: readonly (readonly (string | TextRun[])[])[],
  palette: DocxPalette,
  opts: {
    header?: boolean;
    compact?: boolean;
    bold?: readonly number[];
    soft?: readonly number[];
  } = {},
): Table => {
  const cols = widths(
    columns.map((c) => c.width),
    CONTENT_WIDTH,
  );
  const size = opts.compact ? px(9) : BODY_SIZE;
  const margins = opts.compact ? cellMargins(4, 5) : cellMargins(6, 9);
  const align = (c: DocxColumn) =>
    c.num ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map(
      (c, i) =>
        new TableCell({
          width: { size: cols[i]!, type: WidthType.DXA },
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: palette.tint,
          },
          borders: { bottom: border(INK, 6) },
          margins,
          children: [
            para(
              [
                run(c.header, {
                  bold: true,
                  size: px(9),
                  caps: true,
                  mono: c.num,
                }),
              ],
              { align: align(c) },
            ),
          ],
        }),
    ),
  });
  const bodyRows = rows.map(
    (cells, r) =>
      new TableRow({
        cantSplit: true,
        children: columns.map((c, i) => {
          const value = cells[i] ?? '';
          return new TableCell({
            width: { size: cols[i]!, type: WidthType.DXA },
            ...(r % 2 === 1
              ? {
                  shading: {
                    type: ShadingType.CLEAR,
                    color: 'auto',
                    fill: ZEBRA,
                  },
                }
              : {}),
            borders: { bottom: border(RULE, 6) },
            margins,
            children: [
              typeof value === 'string'
                ? para(
                    [
                      run(value, {
                        size,
                        mono: c.num,
                        bold: opts.bold?.includes(i),
                        color: opts.soft?.includes(i) ? SOFT : INK,
                      }),
                    ],
                    { align: align(c) },
                  )
                : // Runs of their own: the spec sheet's row number, tabbed
                  // to `.rowno`'s 16px column.
                  new Paragraph({
                    alignment: align(c),
                    tabStops: [{ type: TabStopType.LEFT, position: pxTw(20) }],
                    children: value,
                  }),
            ],
          });
        }),
      }),
  );
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: opts.header === false ? bodyRows : [headerRow, ...bodyRows],
  });
};

/** Page 2's numbered rows: the number soft in the label column, the value bold. */
export const specTable = (
  rows: readonly (readonly [string, string])[],
  palette: DocxPalette,
): Table =>
  dataTable(
    [
      { header: '', width: 42 },
      { header: '', width: 58 },
    ],
    rows.map(([labelText, value], i) => [
      [
        new TextRun({
          text: `${i + 1}`,
          size: BODY_SIZE,
          color: SOFT,
        }),
        new TextRun({ text: '\t', size: BODY_SIZE }),
        new TextRun({ text: labelText, size: BODY_SIZE, color: INK }),
      ],
      value,
    ]),
    palette,
    { header: false, bold: [1] },
  );

/** A row of the totals box. `words` spans both columns (the contract's price in words). */
export interface DocxTotalRow {
  label: string;
  value?: string;
  grand?: boolean;
  span?: boolean;
}

/** `.totals`: 58% wide on the right, ink-ruled under a 3px brand rule; the grand total tinted. */
export const totalsTable = (
  rows: readonly DocxTotalRow[],
  palette: DocxPalette,
): Block[] => {
  const width = Math.round(CONTENT_WIDTH * 0.58);
  const cols = widths([45, 55], width);
  return [
    gap(pxTw(14)),
    new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: cols,
      layout: TableLayoutType.FIXED,
      alignment: AlignmentType.RIGHT,
      borders: {
        top: border(palette.primary, 18),
        bottom: border(INK, 6),
        left: border(INK, 6),
        right: border(INK, 6),
        insideHorizontal: NONE,
        insideVertical: NONE,
      },
      rows: rows.map((r, i) => {
        const last = i === rows.length - 1;
        const shading = r.grand
          ? {
              shading: {
                type: ShadingType.CLEAR,
                color: 'auto',
                fill: palette.tintStrong,
              },
            }
          : {};
        const borders = {
          ...(last ? {} : { bottom: border(RULE, 6) }),
          ...(r.grand && i > 0 ? { top: border(INK, 6) } : {}),
        };
        const size = r.grand ? px(14) : BODY_SIZE;
        const margins = r.grand ? cellMargins(8, 10) : cellMargins(5, 10);
        if (r.span) {
          return new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                columnSpan: 2,
                width: { size: width, type: WidthType.DXA },
                ...shading,
                borders,
                margins,
                children: [para([run(r.label, { size })])],
              }),
            ],
          });
        }
        return new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: cols[0]!, type: WidthType.DXA },
              ...shading,
              borders,
              margins,
              verticalAlign: VerticalAlignTable.CENTER,
              children: [para([run(r.label, { size, bold: r.grand })])],
            }),
            new TableCell({
              width: { size: cols[1]!, type: WidthType.DXA },
              ...shading,
              borders,
              margins,
              verticalAlign: VerticalAlignTable.CENTER,
              children: [
                para(
                  [run(r.value ?? '', { size, bold: r.grand, mono: true })],
                  {
                    align: AlignmentType.RIGHT,
                  },
                ),
              ],
            }),
          ],
        });
      }),
    }),
  ];
};

/** `.terms-list`: the percent bold in its own column, the label, the trigger small and soft. */
export const termsList = (
  terms: readonly { percent: string; label: string; trigger?: string | null }[],
): Paragraph[] =>
  terms.map(
    (t) =>
      new Paragraph({
        keepLines: true,
        spacing: { before: pxTw(4), after: pxTw(4) },
        indent: { left: pxTw(4) },
        border: { bottom: { ...border(RULE, 6), space: 4 } },
        tabStops: [{ type: TabStopType.LEFT, position: pxTw(56) }],
        children: [
          run(`${t.percent}%`, { bold: true }),
          new TextRun({ text: '\t', size: BODY_SIZE }),
          run(t.label),
          ...(t.trigger
            ? [
                new TextRun({ text: '  ', size: BODY_SIZE }),
                run(t.trigger, { size: px(8.5), color: SOFT, caps: true }),
              ]
            : []),
        ],
      }),
  );

/** `.sign-caption`: 9px soft. */
const caption = (text: string): Paragraph =>
  para([run(text, { size: px(9), color: SOFT })], { before: pxTw(4) });

/** `.sign-rule`: a 28px space ruled underneath. */
const signRule = (): Paragraph =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: pxTw(28), lineRule: 'exact' },
    border: { bottom: border(INK, 6) },
    children: [new TextRun({ text: '', size: 2 })],
  });

const signTable = (
  cells: TableCell[],
  fractions: readonly number[],
): Block[] => [
  gap(pxTw(20)),
  new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths(fractions, CONTENT_WIDTH),
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [new TableRow({ cantSplit: true, children: cells })],
  }),
];

/**
 * renderSignatureBlock: the signature rule always, the company seal beside
 * it only when the tenant has uploaded one.
 */
export const signatureBlock = (
  branding: TenantBranding | null,
  captionText = 'Authorized signature',
): Block[] => {
  const b: DocumentBranding | null = branding;
  const seal = embeddable(b?.stampUrl);
  // Without a seal the signature column is the table's only one, and runs
  // the full width, as in the PDF.
  const fractions = seal ? [55, 45] : [100];
  const cols = widths(fractions, CONTENT_WIDTH);
  return signTable(
    [
      new TableCell({
        width: { size: cols[0]!, type: WidthType.DXA },
        verticalAlign: VerticalAlignTable.BOTTOM,
        margins: { top: 0, bottom: 0, left: 0, right: pxTw(16) },
        children: [
          signRule(),
          caption(captionText),
          ...(b?.name ? [caption(`for ${b.name}`)] : []),
        ],
      }),
      ...(seal
        ? [
            new TableCell({
              width: { size: cols[1]!, type: WidthType.DXA },
              verticalAlign: VerticalAlignTable.BOTTOM,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new ImageRun({
                      type: seal.type as 'png' | 'jpg',
                      data: seal.data,
                      transformation: fit(seal, 160 / 3.78, 90 / 3.78),
                      // Every picture in the file carries its own id (the
                      // headers use 1-4); Word repairs a file that repeats one.
                      altText: { id: '9', name: 'Company seal' },
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [run('Company seal', { size: px(9), color: SOFT })],
                }),
              ],
            }),
          ]
        : []),
    ],
    fractions,
  );
};

/** renderSignaturePair: two ruled signature columns side by side. */
export const signaturePair = (
  left: { caption: string; lines?: readonly (string | null | undefined)[] },
  right: { caption: string; lines?: readonly (string | null | undefined)[] },
): Block[] => {
  const cols = widths([50, 50], CONTENT_WIDTH);
  const column = (
    side: { caption: string; lines?: readonly (string | null | undefined)[] },
    width: number,
  ): TableCell =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlignTable.BOTTOM,
      margins: { top: 0, bottom: 0, left: 0, right: pxTw(16) },
      children: [
        signRule(),
        caption(side.caption),
        ...(side.lines ?? [])
          .filter((line): line is string => Boolean(line))
          .map(caption),
      ],
    });
  return signTable([column(left, cols[0]!), column(right, cols[1]!)], [50, 50]);
};

/** The title, its brand rule and the cover lines, as `.doc-cover` / `.cover-band` set them. */
const titleBlock = (
  title: string,
  coverLines: readonly string[],
  palette: DocxPalette,
  big: boolean,
  innerWidth: number,
): Paragraph[] => {
  const ruleIndent = Math.max(0, Math.round((innerWidth - mm(22)) / 2));
  return [
    para(
      [
        run(title, {
          bold: true,
          size: big ? px(40) : px(22),
          tracking: big ? 3 : 1.5,
        }),
      ],
      {
        align: AlignmentType.CENTER,
      },
    ),
    new Paragraph({
      spacing: {
        before: big ? mm(5) : mm(3),
        after: big ? mm(6) : mm(3),
        line: 60,
        lineRule: 'exact',
      },
      indent: { left: ruleIndent, right: ruleIndent },
      border: { bottom: border(palette.primary, 18) },
      children: [new TextRun({ text: '', size: 2 })],
    }),
    ...coverLines.map((line, i) =>
      i % 2 === 1
        ? para([run(line, { bold: true, size: big ? px(20) : px(12.5) })], {
            align: AlignmentType.CENTER,
            before: big ? mm(2) : mm(1),
            after: big ? mm(2) : mm(1),
          })
        : para([run(line, { color: SOFT, size: big ? px(15) : px(10.5) })], {
            align: AlignmentType.CENTER,
            before: big ? mm(3) : 0,
          }),
    ),
  ];
};

export interface DocxDocumentOptions {
  branding: TenantBranding | null;
  /** e.g. "QUOTATION". */
  documentTitle: string;
  /** Lines under the title — "Project", the project; or "Between", a party, "and", the other. */
  coverLines?: readonly string[];
  /** A cover page of its own, as the PDF's: defaults to on whenever there are cover lines. */
  cover?: boolean;
  /** The fine print after the body, e.g. a validity notice. */
  footerNote?: string;
  /** The document's own blocks. */
  children: readonly Block[];
}

/**
 * The whole Word document, set as renderLayout sets the PDF: the letterhead
 * logo centred in the top band and the address, page number and phones in
 * the bottom band on every page; the tenant's watermark centred behind
 * every page; a cover page alone on page one when the document has one,
 * otherwise the title opening page one; then the body and its fine print.
 */
export const buildDocxDocument = (opts: DocxDocumentOptions): Document => {
  const {
    branding,
    documentTitle,
    children,
    footerNote,
    coverLines = [],
  } = opts;
  const cover = opts.cover ?? coverLines.length > 0;
  const b: DocumentBranding | null = branding;
  const palette = paletteOf(branding);
  const phones = (b?.phones ?? []).filter(Boolean).join('/');

  const logo = LETTERHEAD;
  const watermark = embeddable(b?.watermarkUrl);
  // Each section draws its own copy of the header, and every picture in the
  // file needs an id of its own, so each copy is numbered from `first`.
  const header = (first: number) =>
    new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            ...(logo
              ? [
                  new ImageRun({
                    type: logo.type as 'png' | 'jpg',
                    data: logo.data,
                    transformation: fit(logo, 120, 18),
                    altText: { id: String(first), name: 'Logo' },
                  }),
                ]
              : []),
            // `.watermark`: 130mm wide, centred on the page, behind the text;
            // DocumentDocxService hands it over already faded to the PDF's 20%.
            ...(watermark
              ? [
                  new ImageRun({
                    type: watermark.type as 'png' | 'jpg',
                    data: watermark.data,
                    transformation: fit(watermark, 130, 1000, true),
                    altText: { id: String(first + 1), name: 'Watermark' },
                    floating: {
                      horizontalPosition: {
                        relative: HorizontalPositionRelativeFrom.PAGE,
                        align: HorizontalPositionAlign.CENTER,
                      },
                      verticalPosition: {
                        relative: VerticalPositionRelativeFrom.PAGE,
                        align: VerticalPositionAlign.CENTER,
                      },
                      behindDocument: true,
                      allowOverlap: true,
                      wrap: { type: TextWrappingType.NONE },
                    },
                  }),
                ]
              : []),
          ],
        }),
      ],
    });

  // The client's footer: the address on one line, the page number and the
  // phones on the next, centred and bold, 9px.
  const footer = new Footer({
    children: [
      ...(b?.address
        ? [
            para([run(b.address, { bold: true, size: px(9) })], {
              align: AlignmentType.CENTER,
            }),
          ]
        : []),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            bold: true,
            size: px(9),
            color: INK,
          }),
          ...(phones
            ? [run(`  Tel: ${phones}`, { bold: true, size: px(9) })]
            : []),
        ],
      }),
    ],
  });

  const page = (first: number) => ({
    properties: { page: PAGE },
    headers: { default: header(first) },
    footers: { default: footer },
  });

  const tail: Block[] = footerNote ? [fineprint(footerNote)] : [];

  // `.cover-band`: ruled above and below, 20mm by 10mm of padding, centred
  // on page one by its own section.
  const bandWidth = CONTENT_WIDTH;
  const coverSection: ISectionOptions = {
    ...page(1),
    properties: {
      page: PAGE,
      verticalAlign: VerticalAlignSection.CENTER,
    },
    children: [
      new Table({
        width: { size: bandWidth, type: WidthType.DXA },
        columnWidths: [bandWidth],
        layout: TableLayoutType.FIXED,
        borders: { ...NO_BORDERS, top: border(INK, 6), bottom: border(INK, 6) },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: bandWidth, type: WidthType.DXA },
                margins: {
                  top: mm(20),
                  bottom: mm(20),
                  left: mm(10),
                  right: mm(10),
                },
                children: titleBlock(
                  documentTitle,
                  coverLines,
                  palette,
                  true,
                  bandWidth - mm(20),
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  };

  const sections: ISectionOptions[] = cover
    ? [
        coverSection,
        { ...page(3), children: collapseMargins([...children, ...tail]) },
      ]
    : [
        {
          ...page(1),
          children: collapseMargins([
            ...titleBlock(
              documentTitle,
              coverLines,
              palette,
              false,
              CONTENT_WIDTH,
            ),
            gap(mm(8)),
            ...children,
            ...tail,
          ]),
        },
      ];

  return new Document({
    styles: {
      default: {
        document: {
          // Word cannot embed the PDF's Ethiopic font; `cs` names the face
          // Word uses for Ethiopic script, if the reader has it installed.
          run: {
            font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Noto Sans Ethiopic' },
            size: BODY_SIZE,
            color: INK,
          },
          paragraph: { spacing: { line: BODY_LINE } },
        },
      },
    },
    sections,
  });
};
