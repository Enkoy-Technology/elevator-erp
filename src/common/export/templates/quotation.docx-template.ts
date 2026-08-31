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
import { formatEtb } from './money-format';
import { fmtDate, PRICING_ROWS, TECH_ROWS, type QuotationTemplateData } from './quotation.template';

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
  const pricing = d.pricingBreakdown ?? {};
  const tech = d.technicalSpec ?? {};
  const primary = branding?.primaryColor ?? null;

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null).map((r) =>
    row(
      r.label,
      `${r.format ? r.format(tech[r.key]) : String(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}`,
    ),
  );
  const pricingRows = PRICING_ROWS.filter((r) => pricing[r.key] != null).map((r) =>
    row(r.label, formatEtb(pricing[r.key])),
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
    heading('Technical Specification', primary),
    fullWidthTable(techRows.length ? techRows : [row('See attached specification', '—')]),
    heading('Pricing', primary),
    // docx's Table rejects a zero-row table (unlike an empty HTML <table>,
    // which the PDF template tolerates silently) — fall back to a single
    // placeholder row rather than let an unfunded quote crash the render.
    fullWidthTable(pricingRows.length ? pricingRows : [row('See pricing breakdown', '—')]),
    heading('Totals', primary),
    fullWidthTable([
      row('Subtotal', formatEtb(d.subtotalEtb)),
      row(`Margin (${d.marginPercent ?? '0'}%)`, formatEtb(d.marginAmountEtb)),
      row(`Tax (${d.taxPercent ?? '0'}%)`, formatEtb(d.taxAmountEtb)),
      grandRow('Total', formatEtb(d.totalPriceEtb)),
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
