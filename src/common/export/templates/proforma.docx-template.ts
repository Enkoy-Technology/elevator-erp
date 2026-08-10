import { Document, Paragraph, Table, TextRun } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { sanitizeHex } from './layout';
import { formatEtb } from './money-format';
import type { ProformaTemplateData } from './proforma.template';
import { fullWidthTable, heading, row } from './quotation.docx-template';
import { fmtDate, PRICING_ROWS, TECH_ROWS } from './quotation.template';

export { formatEtb };

/**
 * Builds the proforma invoice as a native docx `Document` — mirrors
 * buildQuotationDocx's section shell (letterhead, meta, technical spec,
 * pricing, totals, notes, footer) via the same row/table/heading helpers;
 * only the title, the identifying number, and the totals block's field
 * names (vatEtb/totalEtb vs the quotation's taxAmountEtb/totalPriceEtb)
 * differ. Logo-omission reasoning is the same as buildQuotationDocx's own
 * doc comment.
 */
export const buildProformaDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as ProformaTemplateData;
  const pricing = d.pricingBreakdown ?? {};
  const tech = d.technicalSpec ?? {};
  const primary = sanitizeHex(branding?.primaryColor);

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null).map((r) =>
    row(r.label, `${String(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}`),
  );
  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null).map((r) =>
    row(r.label, formatEtb(pricing[r.key])),
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
        new TextRun({ text: 'PROFORMA INVOICE', bold: true, size: 32, color: primary }),
        new TextRun({ text: `   ${d.status}`, bold: true, size: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(
          `Proforma No.: ${d.proformaNumber}    Issued: ${fmtDate(d.issuedAt)}    Valid Until: ${fmtDate(d.validUntil)}`,
        ),
      ],
    }),
    heading('Prepared For', primary),
    new Paragraph({ children: [new TextRun({ text: d.customerName, bold: true })] }),
    new Paragraph({ children: [new TextRun(`Project: ${d.projectName}`)] }),
    heading('Technical Specification', primary),
    fullWidthTable(techRows.length ? techRows : [row('See attached specification', '')]),
    heading('Pricing', primary),
    fullWidthTable(pricingRows.length ? pricingRows : [row('See pricing breakdown', '')]),
    heading('Totals', primary),
    fullWidthTable([
      row('Subtotal', formatEtb(d.subtotalEtb)),
      row(`Margin (${d.marginPercent ?? '0'}%)`, formatEtb(d.marginAmountEtb)),
      row(`VAT (${d.taxPercent ?? '0'}%)`, formatEtb(d.vatEtb)),
      row('Total', formatEtb(d.totalEtb)),
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
          text: `This proforma invoice is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
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
