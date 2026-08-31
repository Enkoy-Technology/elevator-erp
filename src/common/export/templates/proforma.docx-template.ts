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
import type { ProformaTemplateData } from './proforma.template';
import { fmtDate, TECH_ROWS } from './quotation.template';

export { formatEtb };

/**
 * Builds the proforma invoice as a native docx `Document` — mirrors
 * buildQuotationDocx's section shell (letterhead, reference plate, party
 * blocks, technical spec, pricing, notes, signature, footer) via the same
 * docx-layout.ts helpers; only the title, the identifying number, and the
 * pricing block (taxable base / VAT / total only — no margin, no cost
 * itemization, see ProformaTemplateData's own doc comment) differ.
 * Logo/stamp-omission reasoning is the same as buildQuotationDocx's.
 */
export const buildProformaDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as ProformaTemplateData;
  const tech = d.technicalSpec ?? {};
  const primary = branding?.primaryColor ?? null;

  const techRows = TECH_ROWS.filter((r) => tech[r.key] != null).map((r) =>
    row(r.label, `${String(tech[r.key])}${r.unit ? ` ${r.unit}` : ''}`),
  );

  const children: (Paragraph | Table)[] = [
    plateTable(
      [
        { label: 'Proforma No.', value: d.proformaNumber },
        { label: 'Issued', value: fmtDate(d.issuedAt) },
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
    fullWidthTable([
      row('Supply and installation', formatEtb(d.subtotalEtb)),
      row(`VAT (${d.taxPercent ?? '0'}%)`, formatEtb(d.vatEtb)),
      grandRow('Total', formatEtb(d.totalEtb)),
    ]),
    ...(d.notes ? [heading('Notes', primary), textBlock(d.notes)] : []),
    signatureTable(branding),
  ];

  return buildDocxDocument({
    branding,
    documentTitle: 'PROFORMA INVOICE',
    footerNote: `This proforma invoice is valid until ${fmtDate(d.validUntil)}. Prices in ETB.`,
    children,
  });
};
