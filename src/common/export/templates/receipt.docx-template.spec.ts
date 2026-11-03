import { Packer } from 'docx';
import zlib from 'node:zlib';

import type { TenantBranding } from '../document-pdf.service';
import { FISCAL_NOTICE_TEXT } from './invoice.template';
import { buildReceiptDocx } from './receipt.docx-template';
import { receiptBody, type ReceiptTemplateData } from './receipt.template';

/**
 * The body's text runs, in order, entities decoded, lower-cased (Word sets
 * labels in capitals). word/document.xml is read straight off its zip local
 * header, as quotation.docx-template.spec.ts does.
 */
const bodyText = async (
  d: ReceiptTemplateData,
  branding: TenantBranding | null,
): Promise<string> => {
  const buf = await Packer.toBuffer(buildReceiptDocx(d, branding));
  const name = 'word/document.xml';
  const header = buf.indexOf(name) - 30;
  const size = buf.readUInt32LE(header + 18);
  const start = header + 30 + name.length + buf.readUInt16LE(header + 28);
  const xml = zlib
    .inflateRawSync(buf.subarray(start, start + size))
    .toString('utf8');
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1]!)
    .join(' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .toLowerCase();
};

/** Each needle found after the one before it. */
const expectInOrder = (text: string, needles: readonly string[]): void => {
  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle.toLowerCase(), from);
    expect({ needle, found: at >= 0 }).toEqual({ needle, found: true });
    from = at + needle.length;
  }
};

describe('buildReceiptDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const baseData: ReceiptTemplateData = {
    receiptNumber: 'RCT-FY2026-27-0001',
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    customerName: 'Acme Real Estate PLC',
    amountEtb: '112.00',
    method: 'BANK_TRANSFER',
    reference: 'TXN-998877',
    allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '100.00' }],
    hasOnAccount: true,
    onAccountEtb: '12.00',
    originalReceiptNumber: null,
  };

  const reversal: ReceiptTemplateData = {
    ...baseData,
    amountEtb: '-112.00',
    allocations: [],
    hasOnAccount: false,
    onAccountEtb: '0.00',
    originalReceiptNumber: 'RCT-FY2026-27-0001',
  };

  it('renders a real docx (PK zip) Buffer', async () => {
    const buf = await Packer.toBuffer(buildReceiptDocx(baseData, branding));
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('prints every figure and label the PDF prints, read from the same receiptBody', async () => {
    const text = await bodyText(baseData, branding);
    const b = receiptBody(baseData);
    const printed = [
      b.documentTitle,
      ...b.plate.flatMap((f) => [f.label, f.value]),
      b.receivedFrom.label,
      ...b.receivedFrom.lines,
      b.amount.label,
      b.amount.value,
      b.amountInWords,
      ...b.allocations.flat(),
      ...b.onAccount!,
      b.signatureCaption,
      b.footerNote,
    ];
    for (const needle of printed) {
      expect({ needle, found: text.includes(needle.toLowerCase()) }).toEqual({
        needle,
        found: true,
      });
    }
  });

  it('runs in the PDF order, always with the plain notice', async () => {
    expectInOrder(await bodyText(baseData, branding), [
      'PAYMENT RECEIPT',
      'Receipt No.',
      'BANK_TRANSFER (TXN-998877)',
      'Received From',
      'Acme Real Estate PLC',
      'Amount',
      '112.00 ETB',
      'One hundred twelve',
      'Applied To',
      'INV-FY2026-27-0001',
      'On account',
      FISCAL_NOTICE_TEXT,
      'Received by',
      'This is an acknowledgement of funds received, not a fiscal receipt. Prices in ETB.',
    ]);
  });

  it('titles a reversal after the receipt it reverses, in negative words, with nothing allocated', async () => {
    expectInOrder(await bodyText(reversal, branding), [
      'REVERSAL OF RECEIPT RCT-FY2026-27-0001',
      'Negative',
      'No invoices allocated',
      FISCAL_NOTICE_TEXT,
    ]);
  });

  it('renders without branding', async () => {
    expect(await bodyText(baseData, null)).toContain('rct-fy2026-27-0001');
  });
});
