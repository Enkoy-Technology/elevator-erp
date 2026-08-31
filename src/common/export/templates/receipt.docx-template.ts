import type { Document, Paragraph, Table } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
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
import { buildFiscalStatusParagraphs } from './invoice.docx-template';
import { formatEtb } from './money-format';
import { fmtDate } from './quotation.template';
import type { ReceiptTemplateData } from './receipt.template';

export { formatEtb };

const amountWordsFor = (amountEtb: string): string => {
  const trimmed = amountEtb.trim();
  const isNegative = trimmed.startsWith('-');
  const magnitude = isNegative ? trimmed.slice(1) : trimmed;
  const words = amountInWords(magnitude);
  return isNegative ? `Negative ${words}` : words;
};

/**
 * Builds the payment receipt as a native docx `Document` — mirrors
 * receipt.template.ts's section shell (letterhead, reference plate, party
 * blocks, amount + words, allocations, compliance notice, signature,
 * footer). Always shows the plain compliance notice, never the mirror block
 * — see receipt.template.ts's own doc comment for why.
 */
export const buildReceiptDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as ReceiptTemplateData;
  const primary = branding?.primaryColor ?? null;
  const isReversal = Boolean(d.originalReceiptNumber);
  const title = isReversal ? `REVERSAL OF RECEIPT ${d.originalReceiptNumber}` : 'PAYMENT RECEIPT';

  const allocRows = d.allocations.map((a) => row(a.invoiceNumber, formatEtb(a.amountEtb)));

  const children: (Paragraph | Table)[] = [
    plateTable(
      [
        { label: 'Receipt No.', value: d.receiptNumber },
        { label: 'Received', value: fmtDate(d.receivedAt) },
        {
          label: 'Method',
          value: d.reference ? `${d.method} (${d.reference})` : d.method,
        },
      ],
      primary,
    ),
    partiesTable(branding, { label: 'Received From', lines: [d.customerName] }),
    heading('Amount', primary),
    fullWidthTable([grandRow('Amount', formatEtb(d.amountEtb))]),
    textBlock(amountWordsFor(d.amountEtb), true),
    heading('Applied To', primary),
    fullWidthTable([
      ...(allocRows.length ? allocRows : [row('No invoices allocated', '—')]),
      ...(d.hasOnAccount ? [row('On account', formatEtb(d.onAccountEtb))] : []),
    ]),
    ...buildFiscalStatusParagraphs(undefined, primary ?? ''),
    signatureTable(branding, 'Received by'),
  ];

  return buildDocxDocument({
    branding,
    documentTitle: title,
    footerNote:
      'This is an acknowledgement of funds received, not a fiscal receipt. Prices in ETB.',
    children,
  });
};
