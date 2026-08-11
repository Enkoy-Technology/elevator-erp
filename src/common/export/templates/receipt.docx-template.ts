import { Document, Paragraph, Table, TextRun } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { amountInWords } from './amount-in-words';
import { buildFiscalStatusParagraphs } from './invoice.docx-template';
import { sanitizeHex } from './layout';
import { formatEtb } from './money-format';
import { fullWidthTable, heading, row } from './quotation.docx-template';
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
 * receipt.template.ts's section shell (letterhead, meta, amount + words,
 * allocations, compliance notice, footer). Always shows the plain
 * compliance notice, never the mirror block — see receipt.template.ts's own
 * doc comment for why.
 */
export const buildReceiptDocx = (data: object, branding: TenantBranding | null): Document => {
  const d = data as ReceiptTemplateData;
  const primary = sanitizeHex(branding?.primaryColor);
  const isReversal = Boolean(d.originalReceiptNumber);
  const title = isReversal ? `REVERSAL OF RECEIPT ${d.originalReceiptNumber}` : 'PAYMENT RECEIPT';

  const allocRows = d.allocations.map((a) => row(a.invoiceNumber, formatEtb(a.amountEtb)));

  const phones = (branding?.phones ?? []).filter(Boolean).join(' · ');
  const footerLine = [branding?.address, phones].filter(Boolean).join(' · ');

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: branding?.name ?? '', bold: true, size: 32, color: primary })],
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
      children: [new TextRun({ text: title, bold: true, size: 32, color: primary })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun(
          `Receipt No.: ${d.receiptNumber}    Received: ${fmtDate(d.receivedAt)}    Method: ${d.method}${d.reference ? ` (${d.reference})` : ''}`,
        ),
      ],
    }),
    heading('Received From', primary),
    new Paragraph({ children: [new TextRun({ text: d.customerName, bold: true })] }),
    heading('Amount', primary),
    fullWidthTable([row('Amount', formatEtb(d.amountEtb))]),
    new Paragraph({
      spacing: { before: 80, after: 200 },
      children: [new TextRun({ text: amountWordsFor(d.amountEtb), italics: true })],
    }),
    heading('Applied To', primary),
    fullWidthTable([
      ...(allocRows.length ? allocRows : [row('No invoices allocated', '')]),
      ...(d.hasOnAccount ? [row('On account', formatEtb(d.onAccountEtb))] : []),
    ]),
    ...buildFiscalStatusParagraphs(undefined, primary),
    new Paragraph({
      spacing: { before: 400 },
      children: [new TextRun({ text: footerLine, size: 18, color: '888888' })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'This is an acknowledgement of funds received, not a fiscal receipt. Prices in ETB.',
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
