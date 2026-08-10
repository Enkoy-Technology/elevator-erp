import {
  PROFORMA_DOCUMENT_COLUMNS,
  proformaDocumentData,
  type ProformaDocumentRow,
} from './proforma-document.mapper';

const row: ProformaDocumentRow = {
  proformaNumber: 'PF-FY2026-27-0001',
  status: 'ISSUED',
  issuedAt: new Date('2026-08-01T00:00:00.000Z'),
  validUntil: '2026-09-30',
  customerName: 'Acme Real Estate PLC',
  projectName: 'Bole Twin Towers — Lift A',
  technicalSpec: { capacityPersons: 13 },
  pricingBreakdown: { baseCost: '80000.00' },
  marginPercent: '25.00',
  marginAmountEtb: '25000.00',
  taxPercent: '15.00',
  subtotalEtb: '100000.00',
  vatEtb: '18750.00',
  totalEtb: '143750.00',
};

describe('proformaDocumentData', () => {
  it('maps the proforma own field names (vatEtb/totalEtb) and the joined quotation line data', () => {
    expect(proformaDocumentData(row)).toEqual({
      proformaNumber: 'PF-FY2026-27-0001',
      status: 'ISSUED',
      issuedAt: row.issuedAt,
      validUntil: '2026-09-30',
      customerName: 'Acme Real Estate PLC',
      projectName: 'Bole Twin Towers — Lift A',
      technicalSpec: { capacityPersons: 13 },
      pricingBreakdown: { baseCost: '80000.00' },
      subtotalEtb: '100000.00',
      marginPercent: '25.00',
      marginAmountEtb: '25000.00',
      taxPercent: '15.00',
      vatEtb: '18750.00',
      totalEtb: '143750.00',
      notes: null,
    });
  });

  it('passes money fields through as raw decimal strings, not pre-formatted', () => {
    const data = proformaDocumentData(row);
    expect(data.totalEtb).toBe('143750.00');
    expect(data.totalEtb).not.toContain('ETB');
  });

  it('falls back to an empty string when the customer/project join found no name', () => {
    const data = proformaDocumentData({ ...row, customerName: null, projectName: null });
    expect(data.customerName).toBe('');
    expect(data.projectName).toBe('');
  });
});

describe('PROFORMA_DOCUMENT_COLUMNS', () => {
  it('marks every money column with format: "money" and every date column with format: "date"', () => {
    const money = ['subtotalEtb', 'vatEtb', 'totalEtb'];
    const dates = ['issuedAt', 'validUntil'];
    for (const col of PROFORMA_DOCUMENT_COLUMNS) {
      if (money.includes(col.key)) {
        expect(col.format).toBe('money');
      }
      if (dates.includes(col.key)) {
        expect(col.format).toBe('date');
      }
    }
  });

  it('every column key resolves on the joined row (the row IS the xlsx export row)', () => {
    for (const col of PROFORMA_DOCUMENT_COLUMNS) {
      expect(row).toHaveProperty(col.key);
    }
  });
});
