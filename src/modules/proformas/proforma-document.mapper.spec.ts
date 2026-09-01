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
  subtotalEtb: '100000.00',
  vatEtb: '15000.00',
  totalEtb: '115000.00',
};

describe('proformaDocumentData', () => {
  it('maps the proforma own field names (vatEtb/totalEtb) and its own snapshot line data, deriving taxPercent from subtotal/vat', () => {
    expect(proformaDocumentData(row)).toEqual({
      proformaNumber: 'PF-FY2026-27-0001',
      status: 'ISSUED',
      issuedAt: row.issuedAt,
      validUntil: '2026-09-30',
      customerName: 'Acme Real Estate PLC',
      projectName: 'Bole Twin Towers — Lift A',
      technicalSpec: { capacityPersons: 13 },
      subtotalEtb: '100000.00',
      taxPercent: '15.00',
      vatEtb: '15000.00',
      totalEtb: '115000.00',
      notes: null,
      // Snapshotted at issue time. A pre-lines proforma carries none, and the
      // template falls back to the single line its header implies.
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

  it('maps the snapshotted lines, payment terms and commercial terms', () => {
    // These columns were written at issue time and then never read: the
    // customer's proforma printed one implied line and no terms, while the
    // quotation it was issued from printed both.
    const data = proformaDocumentData({
      ...row,
      referenceCode: 'Rodas FUJIHD-E02',
      deliveryDays: 7,
      warrantyPartsMonths: 60,
      warrantyFreeServiceMonths: 12,
      validityDays: 5,
      paymentTerms: [
        { percent: '50.00', label: 'Advance', triggerEvent: 'On signing' },
      ],
      lines: [
        {
          sequence: 1,
          productType: 'PASSENGER',
          specSummary: '800KG -10persons / Speed 1.5m/s',
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
          calcInput: null,
          technicalSpec: null,
        },
      ],
    });

    expect(data.referenceCode).toBe('Rodas FUJIHD-E02');
    expect(data.deliveryDays).toBe(7);
    expect(data.warrantyPartsMonths).toBe(60);
    expect(data.paymentTerms).toHaveLength(1);
    expect(data.lines).toHaveLength(1);
    const [line] = data.lines ?? [];
    expect(line?.lineTotalEtb).toBe('6813043.48');
    // Derived from the labels when the snapshot did not carry the summary —
    // 13 stops, one entrance, so their own "13/13/13".
    expect(line?.floorDisplaySummary).toBe('B+G+M+10');
    expect(line?.floorsStopsDoors).toBe('13/13/13');
  });

  it('passes the tenant appendix through when the caller loaded it', () => {
    const data = proformaDocumentData(row, {
      boilerplate: [{ title: 'Standards', body: 'EN 81-20 / EN 81-50' }],
      components: [
        { sequence: 1, componentName: 'Traction machine', brand: 'FUJI', remark: null },
      ],
    });
    expect(data.boilerplate).toHaveLength(1);
    expect(data.components).toHaveLength(1);
  });

  it('passes money fields through as raw decimal strings, not pre-formatted', () => {
    const data = proformaDocumentData(row);
    expect(data.totalEtb).toBe('115000.00');
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
