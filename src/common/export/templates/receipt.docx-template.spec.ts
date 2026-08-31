import { Packer } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildReceiptDocx } from './receipt.docx-template';
import type { ReceiptTemplateData } from './receipt.template';

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
    allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '112.00' }],
    hasOnAccount: false,
    onAccountEtb: '0.00',
    originalReceiptNumber: null,
  };

  it('renders a real docx (PK zip) Buffer', async () => {
    const doc = buildReceiptDocx(baseData, branding);
    const buf = await Packer.toBuffer(doc);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('renders a reversal receipt without throwing', async () => {
    const doc = buildReceiptDocx(
      {
        ...baseData,
        amountEtb: '-112.00',
        allocations: [{ invoiceNumber: 'INV-FY2026-27-0001', amountEtb: '-112.00' }],
        originalReceiptNumber: 'RCT-FY2026-27-0001',
      },
      branding,
    );
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders with no allocations without crashing on a zero-row table', async () => {
    const doc = buildReceiptDocx({ ...baseData, allocations: [] }, branding);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders without branding', async () => {
    const doc = buildReceiptDocx(baseData, null);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
});
