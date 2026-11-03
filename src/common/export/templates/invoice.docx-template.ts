import type { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  buildDocxDocument,
  dataTable,
  fiscalMirror,
  fiscalNotice,
  heading,
  paletteOf,
  partiesTable,
  plateTable,
  signatureBlock,
  totalsTable,
} from './docx-layout';
import {
  FISCAL_NOTICE_TEXT,
  fiscalMirrorLines,
  invoiceBody,
  type InvoiceTemplateData,
} from './invoice.template';
import { formatEtb } from './money-format';

export { formatEtb };

/**
 * The invoice in Word, section for section the PDF, read from the same
 * invoiceBody (client, 2026-10-30: the Word file did not look like the
 * PDF). The compliance notice — or, once the fiscal columns are filled, the
 * mirror block — sits directly above the totals, as invoice.template.ts's
 * compliance comment requires of every format; fiscalMirrorLines makes the
 * same decision the PDF makes.
 *
 * Where two blocks meet, buildDocxDocument keeps only the larger gap, as
 * the PDF's adjoining CSS margins collapse.
 */
export const buildInvoiceDocx = (
  data: object,
  branding: TenantBranding | null,
): Document => {
  const d = data as InvoiceTemplateData;
  const b = invoiceBody(d);
  const palette = paletteOf(branding);
  const mirror = fiscalMirrorLines(d);
  const fiscal = mirror
    ? fiscalMirror(mirror, palette)
    : fiscalNotice(FISCAL_NOTICE_TEXT, palette);

  return buildDocxDocument({
    branding,
    documentTitle: b.documentTitle,
    footerNote: b.footerNote,
    children: [
      ...plateTable(b.plate, palette),
      ...partiesTable(branding, b.billedTo),
      heading('Items', palette),
      dataTable(
        [
          { header: 'Description', width: 46 },
          { header: 'Qty', width: 12, num: true },
          { header: 'Unit Price', width: 21, num: true },
          { header: 'Line Total', width: 21, num: true },
        ],
        b.items.map((row) => [...row]),
        palette,
      ),
      ...fiscal,
      ...totalsTable(
        [
          b.subtotal,
          b.vat,
          { ...b.total, grand: true },
          ...(b.withholding
            ? [
                b.withholding.deduction,
                { ...b.withholding.netCashDue, grand: true },
              ]
            : []),
        ],
        palette,
      ),
      ...signatureBlock(branding),
    ],
  });
};
