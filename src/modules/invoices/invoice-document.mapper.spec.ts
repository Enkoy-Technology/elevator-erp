import { FISCAL_NOTICE_TEXT } from '../../common/export/templates/invoice.template';
import {
  INVOICE_DOCUMENT_COLUMNS,
  invoiceDocumentData,
  withDocumentStatus,
  type InvoiceDocumentRow,
} from './invoice-document.mapper';

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

describe('withDocumentStatus — R6: the xlsx export must carry the same fiscal notice/mirror as PDF/DOCX', () => {
  it('leads INVOICE_DOCUMENT_COLUMNS with a "Document Status" column', () => {
    expect(INVOICE_DOCUMENT_COLUMNS[0]).toEqual({
      key: 'documentStatus',
      header: 'Document Status',
    });
  });

  it('stamps the compliance notice when fiscalReceiptNumber is null', () => {
    const row = withDocumentStatus(baseRow);
    expect(row.documentStatus).toBe(FISCAL_NOTICE_TEXT);
  });

  it('stamps the mirror text — with "mirrored from the certified device" — once fiscalReceiptNumber is populated', () => {
    const row = withDocumentStatus({
      ...baseRow,
      fiscalReceiptNumber: 'ETR-000123456',
      fiscalIssuedAt: new Date('2026-08-01T00:00:00.000Z'),
      fiscalDeviceSerial: 'SN-9988776655',
    });
    expect(row.documentStatus).toContain('ETR-000123456');
    expect(row.documentStatus).toContain('mirrored from the certified device');
    expect(row.documentStatus).not.toContain(FISCAL_NOTICE_TEXT);
  });

  it('leaves every other field on the row untouched', () => {
    const row = withDocumentStatus(baseRow);
    expect(row.invoiceNumber).toBe(baseRow.invoiceNumber);
    expect(row.totalEtb).toBe(baseRow.totalEtb);
  });
});
