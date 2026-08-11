import { invoiceDocumentData, type InvoiceDocumentRow } from './invoice-document.mapper';

const baseRow: InvoiceDocumentRow = {
  invoiceNumber: 'INV-FY2026-27-0001',
  status: 'ISSUED',
  issuedAt: new Date('2026-08-01T00:00:00.000Z'),
  dueDate: '2026-09-30',
  customerName: 'Acme',
  projectName: 'Bole Tower',
  lines: [
    { description: 'Elevator unit', quantity: '1', unitPriceEtb: '80000.00', lineTotalEtb: '80000.00' },
  ],
  subtotalEtb: '100000.00',
  vatEtb: '15000.00',
  totalEtb: '115000.00',
  whtEtb: '0.00',
  whtVoucherRef: null,
  fiscalReceiptNumber: null,
  fiscalDeviceSerial: null,
  fiscalIssuedAt: null,
  fiscalKind: null,
  fiscalNote: null,
};

describe('invoiceDocumentData', () => {
  it('derives taxPercent from subtotal/vat and passes lines/customer/project through', () => {
    const data = invoiceDocumentData(baseRow);
    expect(data.taxPercent).toBe('15.00');
    expect(data.customerName).toBe('Acme');
    expect(data.projectName).toBe('Bole Tower');
    expect(data.lines).toEqual(baseRow.lines);
  });

  it('sets hasWithholding false and netCashDueEtb equal to totalEtb when whtEtb is zero', () => {
    const data = invoiceDocumentData(baseRow);
    expect(data.hasWithholding).toBe(false);
    expect(data.whtDeductionEtb).toBe('0.00');
    expect(data.netCashDueEtb).toBe('115000.00');
  });

  it('sets hasWithholding true and computes the deduction/net-cash-due when whtEtb is non-zero', () => {
    const data = invoiceDocumentData({ ...baseRow, whtEtb: '3450.00', whtVoucherRef: 'WHT-2026-000123' });
    expect(data.hasWithholding).toBe(true);
    expect(data.whtDeductionEtb).toBe('-3450.00');
    expect(data.netCashDueEtb).toBe('111550.00');
    expect(data.whtVoucherRef).toBe('WHT-2026-000123');
  });

  it('falls back to an empty customer name when the join found no customer', () => {
    const data = invoiceDocumentData({ ...baseRow, customerName: null });
    expect(data.customerName).toBe('');
  });

  it('passes the fiscal mirror columns through unchanged', () => {
    const data = invoiceDocumentData({
      ...baseRow,
      fiscalReceiptNumber: 'ETR-1',
      fiscalDeviceSerial: 'SN-1',
      fiscalIssuedAt: new Date('2026-08-05T00:00:00.000Z'),
      fiscalKind: 'Z-report',
      fiscalNote: 'note',
    });
    expect(data.fiscalReceiptNumber).toBe('ETR-1');
    expect(data.fiscalDeviceSerial).toBe('SN-1');
    expect(data.fiscalKind).toBe('Z-report');
    expect(data.fiscalNote).toBe('note');
  });
});
