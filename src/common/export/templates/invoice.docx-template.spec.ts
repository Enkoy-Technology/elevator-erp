import { Packer } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildInvoiceDocx } from './invoice.docx-template';
import type { InvoiceTemplateData } from './invoice.template';

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
      { description: 'Supply and installation', quantity: '1', unitPriceEtb: '100000.00', lineTotalEtb: '100000.00' },
    ],
    subtotalEtb: '100000.00',
    taxPercent: '15.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
    hasWithholding: false,
    whtVoucherRef: null,
    whtDeductionEtb: '0.00',
    netCashDueEtb: '115000.00',
    fiscalReceiptNumber: null,
  };

  it('renders a real docx (PK zip) Buffer', async () => {
    const doc = buildInvoiceDocx(baseData, branding);
    const buf = await Packer.toBuffer(doc);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('renders with withholding present without throwing', async () => {
    const doc = buildInvoiceDocx(
      {
        ...baseData,
        hasWithholding: true,
        whtVoucherRef: 'WHT-2026-000123',
        whtDeductionEtb: '-3450.00',
        netCashDueEtb: '111550.00',
      },
      branding,
    );
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders with the fiscal mirror populated without throwing', async () => {
    const doc = buildInvoiceDocx(
      {
        ...baseData,
        fiscalReceiptNumber: 'ETR-000123456',
        fiscalIssuedAt: new Date('2026-08-01T00:00:00.000Z'),
        fiscalDeviceSerial: 'SN-9988776655',
      },
      branding,
    );
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('falls back to a placeholder row instead of crashing on an empty lines array', async () => {
    const doc = buildInvoiceDocx({ ...baseData, lines: [] }, branding);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders without branding', async () => {
    const doc = buildInvoiceDocx(baseData, null);
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
});
