import { receiptDocumentData, type PaymentDocumentRow } from './receipt-document.mapper';

const baseRow: PaymentDocumentRow = {
  receiptNumber: 'RCT-FY2026-27-0001',
  receivedAt: new Date('2026-08-01T00:00:00.000Z'),
  customerName: 'Acme',
  amountEtb: '112.00',
  method: 'BANK_TRANSFER',
  reference: 'TXN-1',
  allocations: [{ invoiceNumber: 'INV-1', amountEtb: '112.00' }],
  originalReceiptNumber: null,
};

describe('receiptDocumentData', () => {
  it('passes customer/method/reference through and marks hasOnAccount false when fully allocated', () => {
    const data = receiptDocumentData(baseRow);
    expect(data.customerName).toBe('Acme');
    expect(data.method).toBe('BANK_TRANSFER');
    expect(data.reference).toBe('TXN-1');
    expect(data.hasOnAccount).toBe(false);
    expect(data.onAccountEtb).toBe('0.00');
  });

  it('computes onAccountEtb as amountEtb minus the sum of allocations, and sets hasOnAccount true when non-zero', () => {
    const data = receiptDocumentData({
      ...baseRow,
      amountEtb: '150.00',
      allocations: [{ invoiceNumber: 'INV-1', amountEtb: '112.00' }],
    });
    expect(data.hasOnAccount).toBe(true);
    expect(data.onAccountEtb).toBe('38.00');
  });

  it('handles a fully unallocated (on-account) payment', () => {
    const data = receiptDocumentData({ ...baseRow, allocations: [] });
    expect(data.hasOnAccount).toBe(true);
    expect(data.onAccountEtb).toBe('112.00');
    expect(data.allocations).toEqual([]);
  });

  it('falls back to an em dash for an allocation whose invoice join found nothing', () => {
    const data = receiptDocumentData({
      ...baseRow,
      allocations: [{ invoiceNumber: null, amountEtb: '112.00' }],
    });
    expect(data.allocations).toEqual([{ invoiceNumber: '—', amountEtb: '112.00' }]);
  });

  it('falls back to an empty customer name when the join found no customer', () => {
    const data = receiptDocumentData({ ...baseRow, customerName: null });
    expect(data.customerName).toBe('');
  });

  it('passes originalReceiptNumber through for a reversal', () => {
    const data = receiptDocumentData({ ...baseRow, originalReceiptNumber: 'RCT-FY2026-27-0000' });
    expect(data.originalReceiptNumber).toBe('RCT-FY2026-27-0000');
  });

  it('computes a negative onAccountEtb correctly for a reversal (already-negated amount and allocations)', () => {
    const data = receiptDocumentData({
      ...baseRow,
      amountEtb: '-150.00',
      allocations: [{ invoiceNumber: 'INV-1', amountEtb: '-112.00' }],
      originalReceiptNumber: 'RCT-FY2026-27-0000',
    });
    expect(data.hasOnAccount).toBe(true);
    expect(data.onAccountEtb).toBe('-38.00');
  });
});
