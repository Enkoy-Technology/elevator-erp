import type { Document, Paragraph, Table } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  buildDocxDocument,
  fullWidthTable,
  grandRow,
  heading,
  partiesTable,
  plateTable,
  row,
  signatureTable,
  textBlock,
} from './docx-layout';
import { formatEtb, netOfTaxEtb } from './money-format';
import { fmtDate, TECH_ROWS, type QuotationTemplateData } from './quotation.template';

export { formatEtb };

/**
 * Builds the quotation as a native docx `Document` model — mirrors
 * quotation.template.ts's sections (letterhead, reference plate, party
 * blocks, technical spec table, pricing table, totals, notes, signature,
 * footer) as directly as the two formats allow, through the shared
 * docx-layout.ts shell. No HTML-escaping needed: docx builds a document
 * object model, not markup, so there is no injection surface to sanitize
 * against here.
 *
 * Logo intentionally omitted: `branding.logoUrl` can be a remote https URL,
 * and `docx`'s ImageRun needs an in-memory buffer — fetching it would add
 * HTTP I/O to a pure renderer (explicitly out of scope per the brief). Word
 * output is text-letterhead-only for every tenant, not just those with a
 * remote logo, so there is one code path instead of a conditional one. The
 * same reasoning covers `branding.stampUrl` on the signature block.
 */
export const buildQuotationDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as QuotationTemplateData;
  const tech = d.technicalSpec ?? {};
  const primary = branding?.primaryColor ?? null;

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null).map((r) =>
    row(
      r.label,
      `${r.format ? r.format(tech[r.key]) : String(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}`,
    ),
  );

  // Page 1's line table, same columns as the PDF. A pre-lines quotation
  // carries no lines, so fall back to the single line its header implies —
  // the same fallback buildQuotationHtml uses.
  const lineRows = (d.lines ?? []).map((line) =>
    row(
      `${line.quantity} x ${line.specSummary ?? line.productType}`,
      formatEtb(line.lineTotalEtb),
    ),
  );

  const children: (Paragraph | Table)[] = [
    plateTable(
      [
        { label: 'Quote No.', value: d.quoteNumber },
        { label: 'Issued', value: fmtDate(d.createdAt) },
        { label: 'Valid Until', value: fmtDate(d.validUntil) },
        { label: 'Status', value: d.status },
      ],
      primary,
    ),
    partiesTable(branding, {
      label: 'Prepared For',
      lines: [d.customerName, `Project: ${d.projectName}`],
    }),
    heading('Equipment', primary),
    // docx's Table rejects a zero-row table (unlike an empty HTML <table>,
    // which the PDF template tolerates silently) — fall back to a single
    // placeholder row rather than let an unpriced quote crash the render.
    fullWidthTable(
      lineRows.length ? lineRows : [row('See attached specification', '—')],
    ),
    heading('Technical Specification', primary),
    fullWidthTable(techRows.length ? techRows : [row('See attached specification', '—')]),
    heading('Totals', primary),
    // NEVER the margin. This file used to print `Margin (25.00%)` and the
    // pre-margin subtotal, so a salesperson who downloaded .docx instead of
    // .pdf handed the customer the tenant's markup — the one disclosure both
    // document mappers exist to prevent. The ex-VAT figure is derived the
    // same way the PDF derives it, from the total and the tax.
    fullWidthTable([
      row('Total price', formatEtb(netOfTaxEtb(d.totalPriceEtb, d.taxAmountEtb))),
      row(`VAT (${d.taxPercent ?? '0'}%)`, formatEtb(d.taxAmountEtb)),
      grandRow('Grand total', formatEtb(d.totalPriceEtb)),
    ]),
    ...(d.notes ? [heading('Notes', primary), textBlock(d.notes)] : []),
    signatureTable(branding),
  ];

  return buildDocxDocument({
    branding,
    documentTitle: 'QUOTATION',
    footerNote: `This quotation is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
    children,
  });
};
