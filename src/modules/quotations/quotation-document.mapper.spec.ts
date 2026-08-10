import {
  QUOTATION_DOCUMENT_COLUMNS,
  quotationDocumentData,
  type QuotationDocumentRow,
} from './quotation-document.mapper';

const row: QuotationDocumentRow = {
  quoteNumber: 'QTN-2026-ABCD1234',
  status: 'APPROVED',
  createdAt: new Date('2026-07-22T00:00:00.000Z'),
  validUntil: new Date('2026-09-30T00:00:00.000Z'),
  customerName: 'Acme Real Estate PLC',
  projectName: 'Bole Twin Towers — Lift A',
  technicalSpec: { capacityPersons: 13 },
  pricingBreakdown: { baseCost: '80000.00' },
  subtotalEtb: '100000.00',
  marginPercent: '25.00',
  marginAmountEtb: '25000.00',
  taxPercent: '15.00',
  taxAmountEtb: '18750.00',
  totalPriceEtb: '143750.00',
  notes: 'Includes 12-month warranty',
};

describe('quotationDocumentData', () => {
  it('maps every field name-for-name into the shared pdf/docx template contract', () => {
    expect(quotationDocumentData(row)).toEqual({
      quoteNumber: 'QTN-2026-ABCD1234',
      status: 'APPROVED',
      createdAt: row.createdAt,
      validUntil: row.validUntil,
      customerName: 'Acme Real Estate PLC',
      projectName: 'Bole Twin Towers — Lift A',
      technicalSpec: { capacityPersons: 13 },
      pricingBreakdown: { baseCost: '80000.00' },
      subtotalEtb: '100000.00',
      marginPercent: '25.00',
      marginAmountEtb: '25000.00',
      taxPercent: '15.00',
      taxAmountEtb: '18750.00',
      totalPriceEtb: '143750.00',
      notes: 'Includes 12-month warranty',
    });
  });

  it('passes money fields through as raw decimal strings, not pre-formatted (the templates call formatEtb themselves)', () => {
    const data = quotationDocumentData(row);
    expect(data.totalPriceEtb).toBe('143750.00');
    expect(data.totalPriceEtb).not.toContain('ETB');
    expect(data.totalPriceEtb).not.toContain(',');
  });

  it('falls back to an empty string when the customer/project join found no name', () => {
    const data = quotationDocumentData({ ...row, customerName: null, projectName: null });
    expect(data.customerName).toBe('');
    expect(data.projectName).toBe('');
  });
});

describe('QUOTATION_DOCUMENT_COLUMNS', () => {
  it('marks every money column with format: "money" and every date column with format: "date"', () => {
    const money = ['subtotalEtb', 'marginAmountEtb', 'taxAmountEtb', 'totalPriceEtb'];
    const dates = ['createdAt', 'validUntil'];
    for (const col of QUOTATION_DOCUMENT_COLUMNS) {
      if (money.includes(col.key)) {
        expect(col.format).toBe('money');
      }
      if (dates.includes(col.key)) {
        expect(col.format).toBe('date');
      }
    }
  });

  it('every column key resolves on the joined row (the row IS the xlsx export row)', () => {
    for (const col of QUOTATION_DOCUMENT_COLUMNS) {
      expect(row).toHaveProperty(col.key);
    }
  });
});
