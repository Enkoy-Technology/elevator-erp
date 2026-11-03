import type { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  contractContent,
  type ContractBlock,
  type ContractTemplateData,
} from './contract.template';
import {
  buildDocxDocument,
  dataTable,
  heading,
  notesBox,
  paletteOf,
  partyColumns,
  plateTable,
  prose,
  signaturePair,
  totalsTable,
  type Block,
  type DocxPalette,
} from './docx-layout';

/** Columns sized as the PDF's table lays them out, by header. */
const COLUMN_WIDTHS: Record<string, number> = {
  Units: 9,
  Type: 18,
  Specification: 38,
  Configuration: 35,
  '#': 6,
  Instalment: 44,
  Share: 12,
  Amount: 22,
  Due: 16,
};

const block = (b: ContractBlock, palette: DocxPalette): Block[] => {
  switch (b.kind) {
    case 'clause':
      return [prose(b.text)];
    case 'note':
      return notesBox(b.text, palette, { preWrap: b.preWrap });
    case 'table':
      return [
        dataTable(
          b.columns.map((c) => ({
            ...c,
            width: COLUMN_WIDTHS[c.header] ?? 20,
          })),
          b.rows,
          palette,
        ),
      ];
    case 'price':
      return totalsTable(
        [
          { label: b.label, value: b.value, grand: true },
          { label: b.words, span: true },
        ],
        palette,
      );
  }
};

/**
 * The contract in Word, clause for clause the PDF (the client edits it
 * before signing): the same cover, plate, parties, articles and signature
 * lines, drawn from the same contractContent, so the two can never word a
 * clause differently. DRAFT and signed differ here exactly as in the PDF.
 */
export const buildContractDocx = (
  data: object,
  branding: TenantBranding | null,
): Document => {
  const c = contractContent(data as ContractTemplateData, branding);
  const palette = paletteOf(branding);
  return buildDocxDocument({
    branding,
    documentTitle: c.documentTitle,
    coverLines: c.coverLines,
    footerNote: c.footerNote,
    children: [
      ...plateTable(c.plate, palette),
      ...partyColumns(
        c.parties.map((p) => ({ label: p.role, name: p.name, lines: p.lines })),
      ),
      ...notesBox(c.introduction, palette),
      ...c.articles.flatMap((a) => [
        heading(`Article ${a.number}: ${a.title}`, palette),
        ...a.blocks.flatMap((b) => block(b, palette)),
      ]),
      ...c.signatures.flatMap(([left, right]) => signaturePair(left, right)),
    ],
  });
};
