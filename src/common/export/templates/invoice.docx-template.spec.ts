import { Packer } from 'docx';
import zlib from 'node:zlib';

import type { TenantBranding } from '../document-pdf.service';
import { buildInvoiceDocx } from './invoice.docx-template';
import {
  FISCAL_NOTICE_TEXT,
  invoiceBody,
  type InvoiceTemplateData,
} from './invoice.template';

/**
 * The body's text runs, in order, entities decoded, lower-cased (Word sets
 * labels in capitals). word/document.xml is read straight off its zip local
 * header, as quotation.docx-template.spec.ts does.
 */
const bodyText = async (
  d: InvoiceTemplateData,
  branding: TenantBranding | null,
): Promise<string> => {
  const buf = await Packer.toBuffer(buildInvoiceDocx(d, branding));
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

describe('buildInvoiceDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const baseData: InvoiceTemplateData = {
    invoiceNumber: 'INV-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    dueDate: '2026-09-30',
    customerName: 'Acme Real Estate PLC',
    projectName: 'Bole Twin Towers — Lift A',
    lines: [
      {
        description: 'Supply & installation <Lift A>',
        quantity: '1',
        unitPriceEtb: '100000.00',
        lineTotalEtb: '100000.00',
      },
      {
        description: 'Maintenance (Q3)',
        quantity: '3.000',
        unitPriceEtb: '2500.00',
        lineTotalEtb: '7500.00',
      },
    ],
    subtotalEtb: '107500.00',
    taxPercent: '15.00',
    vatEtb: '16125.00',
    totalEtb: '123625.00',
    hasWithholding: false,
    whtVoucherRef: null,
    whtDeductionEtb: '0.00',
    netCashDueEtb: '123625.00',
    fiscalReceiptNumber: null,
  };

  const withholding: InvoiceTemplateData = {
    ...baseData,
    hasWithholding: true,
    whtVoucherRef: 'WHT-2026-000123',
    whtDeductionEtb: '-3450.00',
    netCashDueEtb: '120175.00',
  };

  it('renders a real docx (PK zip) Buffer', async () => {
    const buf = await Packer.toBuffer(buildInvoiceDocx(baseData, branding));
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('prints every figure and label the PDF prints, read from the same invoiceBody', async () => {
    const text = await bodyText(withholding, branding);
    const b = invoiceBody(withholding);
    const printed = [
      b.documentTitle,
      ...b.plate.flatMap((f) => [f.label, f.value]),
      b.billedTo.label,
      ...b.billedTo.lines,
      ...b.items.flat(),
      ...[
        b.subtotal,
        b.vat,
        b.total,
        b.withholding!.deduction,
        b.withholding!.netCashDue,
      ].flatMap((t) => [t.label, t.value]),
      b.footerNote,
    ];
    for (const needle of printed) {
      expect({ needle, found: text.includes(needle.toLowerCase()) }).toEqual({
        needle,
        found: true,
      });
    }
  });

  it('runs in the PDF order, the compliance notice directly above the totals', async () => {
    expectInOrder(await bodyText(withholding, branding), [
      'INVOICE',
      'Invoice No.',
      'Billed To',
      'Acme Real Estate PLC',
      'Project: Bole Twin Towers — Lift A',
      'Items',
      'Supply & installation <Lift A>',
      'Maintenance (Q3)',
      FISCAL_NOTICE_TEXT,
      'Subtotal',
      'VAT (15.00%)',
      'Total',
      'Withholding retained by customer (voucher WHT-2026-000123)',
      'Net cash due',
      'Authorized signature',
      'Payment due by 2026-09-30. Prices in ETB.',
    ]);
  });

  it('replaces the notice with the mirror block once the fiscal receipt is keyed in', async () => {
    const text = await bodyText(
      {
        ...baseData,
        fiscalReceiptNumber: 'ETR-000123456',
        fiscalIssuedAt: new Date('2026-08-01T00:00:00.000Z'),
        fiscalDeviceSerial: 'SN-9988776655',
        fiscalKind: 'Cash register receipt',
      },
      branding,
    );
    expect(text).not.toContain(FISCAL_NOTICE_TEXT.toLowerCase());
    expectInOrder(text, [
      'Fiscal receipt ETR-000123456 issued 2026-08-01 — device SN-9988776655',
      'Cash register receipt',
      'mirrored from the certified device',
      'Subtotal',
    ]);
  });

  it('prints only the header row for an invoice with no lines, as the PDF does', async () => {
    const text = await bodyText({ ...baseData, lines: [] }, branding);
    expectInOrder(text, [
      'Description',
      'Qty',
      'Unit Price',
      'Line Total',
      FISCAL_NOTICE_TEXT,
    ]);
  });

  it('renders without branding', async () => {
    expect(await bodyText(baseData, null)).toContain('inv-fy2026-27-0001');
  });
});
