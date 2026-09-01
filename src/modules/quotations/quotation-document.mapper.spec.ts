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
      // A quotation row carrying no lines/terms of its own maps to empty
      // collections, not to absent keys: the template then prints the single
      // line its header implies.
      lines: [],
      paymentTerms: [],
      referenceCode: null,
      validityDays: null,
      warrantyPartsMonths: null,
      warrantyFreeServiceMonths: null,
      deliveryDays: null,
      boilerplate: undefined,
      components: undefined,
    });
  });

  it('derives the floor plan from the ONE stored input, and never maps the discount onto the customer document', () => {
    const data = quotationDocumentData({
      ...row,
      referenceCode: 'Rodas FUJIHD-E02',
      validityDays: 5,
      warrantyPartsMonths: 60,
      warrantyFreeServiceMonths: 12,
      deliveryDays: 150,
      calculatedTotalEtb: '8521500.00',
      discountAmountEtb: '686500.00',
      discountPercent: '8.06',
      lines: [
        {
          sequence: 1,
          productType: 'PASSENGER',
          specSummary: '800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors',
          quantity: 1,
          unitPriceEtb: '6813043.48',
          lineTotalEtb: '6813043.48',
          machineRoomLabel: 'WITH MR',
          floorLabels: 'B,G,M,1,2,3,4,5,6,7,8,9,10',
          floorDisplaySummary: null,
          doorHeightMm: 2100,
          ropingRatio: '2:1',
          tractionMachineType: 'Gearless',
          controlSystem: 'Simplex',
          powerSupply: '380V AC 50HZ 3-phase 4 lines',
          lightSupply: '240V AC 50HZ Single phase',
          entranceCount: 1,
          calcInput: { capacityKg: 800 },
          technicalSpec: { capacityPersons: 10 },
        },
      ],
      paymentTerms: [
        { percent: '50.00', label: 'Payable upon signing', triggerEvent: 'SIGNING' },
      ],
    });

    expect(data.lines?.[0]?.floorsStopsDoors).toBe('13/13/13');
    // Not stored on the line, so it falls back to the derivation.
    expect(data.lines?.[0]?.floorDisplaySummary).toBe('B+G+M+10');
    expect(data.paymentTerms).toEqual([
      { percent: '50.00', label: 'Payable upon signing', triggerEvent: 'SIGNING' },
    ]);
    expect(data.referenceCode).toBe('Rodas FUJIHD-E02');
    expect(data.warrantyPartsMonths).toBe(60);
    expect(data).not.toHaveProperty('calculatedTotalEtb');
    expect(data).not.toHaveProperty('discountAmountEtb');
    expect(data).not.toHaveProperty('discountPercent');
  });

  it('passes the tenant appendix content straight through to the template', () => {
    const data = quotationDocumentData(row, {
      boilerplate: [{ title: 'Scope of supply', body: 'One passenger elevator.' }],
      components: [{ sequence: 1, componentName: 'Traction machine', brand: 'Montanari', remark: 'Italy' }],
    });
    expect(data.boilerplate).toHaveLength(1);
    expect(data.components?.[0]?.brand).toBe('Montanari');
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
