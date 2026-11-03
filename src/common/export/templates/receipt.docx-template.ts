import type { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import {
  buildDocxDocument,
  dataTable,
  fiscalNotice,
  heading,
  notesBox,
  paletteOf,
  partiesTable,
  plateTable,
  signatureBlock,
  totalsTable,
} from './docx-layout';
import { FISCAL_NOTICE_TEXT } from './invoice.template';
import { formatEtb } from './money-format';
import { receiptBody, type ReceiptTemplateData } from './receipt.template';

export { formatEtb };

/**
 * The payment receipt in Word, section for section the PDF, read from the
 * same receiptBody. Always the plain compliance notice, never the mirror
 * block — see receipt.template.ts for why. As in buildInvoiceDocx, where
 * two blocks meet only the larger gap is kept, as the PDF's margins
 * collapse.
 */
export const buildReceiptDocx = (
  data: object,
  branding: TenantBranding | null,
): Document => {
  const d = data as ReceiptTemplateData;
  const b = receiptBody(d);
  const palette = paletteOf(branding);

  return buildDocxDocument({
    branding,
    documentTitle: b.documentTitle,
    footerNote: b.footerNote,
    children: [
      ...plateTable(b.plate, palette),
      ...partiesTable(branding, b.receivedFrom),
      ...totalsTable([{ ...b.amount, grand: true }], palette),
      ...notesBox(b.amountInWords, palette),
      heading('Applied To', palette),
      dataTable(
        [
          { header: 'Invoice', width: 60 },
          { header: 'Amount Applied', width: 40, num: true },
        ],
        [
          ...(b.allocations.length > 0
            ? b.allocations.map((row) => [...row])
            : [[b.noAllocations, '']]),
          ...(b.onAccount ? [[...b.onAccount]] : []),
        ],
        palette,
      ),
      ...fiscalNotice(FISCAL_NOTICE_TEXT, palette),
      ...signatureBlock(branding, b.signatureCaption),
    ],
  });
};
