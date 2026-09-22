import type { TenantBranding } from '../document-pdf.service';
import {
  documentReferenceCode,
  monthsLabel,
  type DocumentLineData,
} from './commercial-document';
import {
  buildQuotationHtml,
  type QuotationTemplateData,
} from './quotation.template';

/**
 * The client's real proforma, as a test. Their document prices BACKWARD from
 * a round grand total: 7,835,000.00 / 1.15 = 6,813,043.48 ex-VAT, VAT
 * 1,021,956.52, and the three add up to the cent. If a change ever makes the
 * printed ex-VAT line something other than total - VAT, this is where it
 * fails.
 */
const branding: TenantBranding = {
  name: 'Shining Star Electromechanical PLC',
  slogan: 'Elevators and escalators',
  logoUrl: null,
  address: 'Bole, Addis Ababa',
  phones: ['+251 11 618 2020'],
  primaryColor: '#FB9D19',
};

const line: DocumentLineData = {
  sequence: 1,
  productType: 'PASSENGER',
  specSummary:
    '800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors',
  quantity: 1,
  unitPriceEtb: '6813043.48',
  lineTotalEtb: '6813043.48',
  machineRoomLabel: 'WITH MR',
  floorDisplaySummary: 'B+G+M+10',
  floorsStopsDoors: '13/13/13',
  entranceCount: 1,
  doorHeightMm: 2100,
  ropingRatio: '2:1',
  tractionMachineType: 'Gearless traction machine',
  controlSystem: 'Simplex',
  powerSupply: '380V AC 50HZ 3-phase 4 lines',
  lightSupply: '240V AC 50HZ Single phase',
  calcInput: {
    capacityKg: 800,
    speedMs: 1.5,
    travelHeightM: 39,
    machineRoomType: 'MR',
    doorType: 'CENTER_OPEN',
    doorWidthMm: 900,
  },
  technicalSpec: {
    productType: 'PASSENGER',
    capacityPersons: 10,
    carWidthMm: 1400,
    carDepthMm: 1350,
    carHeightMm: 2300,
    shaftWidthMm: 1900,
    shaftDepthMm: 1750,
    pitDepthMm: 1600,
    overheadClearanceMm: 4500,
  },
};

const data: QuotationTemplateData = {
  quoteNumber: 'QTN-2026-1A2B3C4D',
  status: 'APPROVED',
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
  validUntil: new Date('2026-08-25T00:00:00.000Z'),
  customerName: 'Rodas Real Estate PLC',
  projectName: 'Rodas Tower — Bole',
  referenceCode: 'Rodas FUJIHD-E02',
  taxPercent: '15.00',
  subtotalEtb: '6813043.48',
  marginPercent: '25.00',
  marginAmountEtb: '0.00',
  taxAmountEtb: '1021956.52',
  totalPriceEtb: '7835000.00',
  validityDays: 5,
  warrantyPartsMonths: 60,
  warrantyFreeServiceMonths: 12,
  deliveryDays: 150,
  lines: [line],
  paymentTerms: [
    {
      percent: '50.00',
      label: 'Payable upon signing',
      triggerEvent: 'SIGNING',
    },
    {
      percent: '30.00',
      label: 'Payable on shipping documents',
      triggerEvent: null,
    },
  ],
  technicalSpec: line.technicalSpec,
};

describe('the client-shaped commercial document', () => {
  it("prints the client's own three figures, and they add up to the cent", () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('6,813,043.48 ETB'); // total ex-VAT = total - VAT
    expect(html).toContain('1,021,956.52 ETB');
    expect(html).toContain('7,835,000.00 ETB');
  });

  it('never discloses the negotiation on the customer copy', () => {
    const html = buildQuotationHtml(
      {
        ...data,
        // Shape the repository row carries; the mapper drops these, and even
        // if one leaked into `data` the template must not print it.
        ...({
          calculatedTotalEtb: '8521500.00',
          discountAmountEtb: '686500.00',
          discountPercent: '8.06',
        } as Partial<QuotationTemplateData>),
      },
      branding,
    );
    expect(html).not.toContain('8,521,500.00');
    expect(html).not.toContain('686,500.00');
    expect(html).not.toContain('Discount');
    // The margin line the old layout printed is gone too — same reason.
    expect(html).not.toContain('Margin');
  });

  it('labels the plate, the To block and the totals as the client does — and never prints the workflow status', () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('Reference code');
    expect(html).toContain('Rodas FUJIHD-E02');
    expect(html).toContain('Date');
    expect(html).toContain('2026-08-20');
    expect(html).toContain('Quote No.');
    // DRAFT/APPROVED is the client's workflow, not the customer's business.
    expect(html).not.toContain('APPROVED');
    expect(html).not.toContain('Status');
    expect(html).not.toContain('Prepared For');
    expect(html).toContain('>To</div>');
    expect(html).toContain('<td>Total</td>');
    expect(html).toContain('VAT (15.00%)');
    expect(html).toContain('<td>Grand Total</td>');
  });

  it("uses the client's own line-table columns, with the currency named once in the header", () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('No of Units');
    expect(html).toContain('Unit price /Birr');
    expect(html).toContain('Total price /Birr');
    // Cells under a "/Birr" header do not repeat the currency.
    expect(html).toContain('>6,813,043.48</td>');
  });

  it("prints the offer's own special notes under their own heading", () => {
    // Their page 1 names what this lift has beyond the standard options.
    const html = buildQuotationHtml(
      {
        ...data,
        notes:
          'Access Card\nMusic In The Cabin (Based On Client Preference)\nLED Display <in the lobby>',
      },
      branding,
    );
    expect(html).toContain('<h2>Special notes</h2>');
    expect(html).toContain('Music In The Cabin (Based On Client Preference)');
    expect(html).toContain('LED Display &lt;in the lobby&gt;');
    // No notes, no heading.
    expect(buildQuotationHtml(data, branding)).not.toContain('Special notes');
  });

  it('renders the 19-row specification table, numbered 1..n after absent rows are dropped', () => {
    const html = buildQuotationHtml(data, branding);
    for (const label of [
      'Elevator Type',
      'Ordering quantity',
      'With or without machine room',
      'Load (Capacity)',
      'Speed',
      'Travel height (mm)',
      'Floors/stops/doors',
      'Entrances',
      'Floor display',
      'Depth of Pit (mm)',
      'O/H height of overhead (mm)',
      'Shaft size (W x D)',
      'Car size (W x D x H)',
      'Door size (W x H)',
      'Car opening type',
      'Power supply',
      'Light supply',
      'Roping',
      'Traction Machine',
      'Control System',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('800 KG / 10 persons');
    expect(html).toContain('1 unit');
    expect(html).toContain('39,000mm'); // metres in the snapshot, mm on the page
    expect(html).toContain('1 entrance');
    // Each number carries the axis letter that says which one it is.
    expect(html).toContain('W1900 x D1750 mm');
    expect(html).toContain('W1400 x D1350 x H2300 mm');
    expect(html).toContain('W900 x H2100 mm');
    expect(html).toContain('Center opening');
    expect(html).toContain('<span class="rowno">20</span>Control System');
  });

  it("prints the client's own nineteen rows when the line records no entrance count", () => {
    const html = buildQuotationHtml(
      {
        ...data,
        lines: [
          {
            ...line,
            entranceCount: null,
            technicalSpec: {
              ...line.technicalSpec,
              standardLift: '10-person lift, 1900 × 1750 mm standard shaft',
            },
          },
        ],
      },
      branding,
    );
    expect(html).not.toContain('Entrances');
    expect(html).toContain('<span class="rowno">19</span>Control System');
    // The calculator's "Standard lift" line restates Load and Shaft size; it
    // is not one of the rows the client's sheet carries.
    expect(html).not.toContain('Standard lift');
  });

  it('pluralises the ordering quantity and the entrance count', () => {
    const html = buildQuotationHtml(
      { ...data, lines: [{ ...line, quantity: 2, entranceCount: 2 }] },
      branding,
    );
    expect(html).toContain('2 units');
    expect(html).toContain('2 entrances');
  });

  it('drops a spec row whose value is absent instead of printing an empty cell', () => {
    const html = buildQuotationHtml(
      { ...data, lines: [{ ...line, controlSystem: null, ropingRatio: null }] },
      branding,
    );
    expect(html).not.toContain('Control System');
    expect(html).not.toContain('Roping');
    // ...and the numbering closes up behind them.
    expect(html).toContain('<span class="rowno">18</span>Traction Machine');
  });

  it('drops a dimension row entirely when only part of the dimension is known', () => {
    const html = buildQuotationHtml(
      {
        ...data,
        lines: [
          {
            ...line,
            technicalSpec: { ...line.technicalSpec, shaftDepthMm: null },
          },
        ],
      },
      branding,
    );
    expect(html).not.toContain('Shaft size');
  });

  it('titles one spec table per line when the quotation sells more than one', () => {
    const html = buildQuotationHtml(
      {
        ...data,
        lines: [
          line,
          { ...line, sequence: 2, productType: 'CAR_PLATFORM_LIFT' },
        ],
      },
      branding,
    );
    expect(html).toContain('Specification — 1. Passenger elevator');
    expect(html).toContain('Specification — 2. Car platform lift');
  });

  it('prints the payment schedule as percent + label + trigger', () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('50%');
    expect(html).toContain('Payable upon signing');
    expect(html).toContain('SIGNING');
    // A term with no trigger event prints no empty tag.
    expect(html).not.toContain('<span class="term-trigger"></span>');
  });

  it('states the commercial terms the client prints as prose, dropping the ones not set', () => {
    const html = buildQuotationHtml(data, branding);
    expect(html).toContain('5 days from the date of issue');
    // 60 months, stated as they state it, with the date it runs from — the
    // one extra fact the appendix's Warranty prose carries.
    expect(html).toContain(
      'Warranty of main parts (Motor, control system and mechanical parts)',
    );
    expect(html).toContain('5 years from commissioning date');
    expect(html).toContain('12 months'); // free manpower maintenance stays in months
    expect(html).toContain('150 working days');

    const bare = buildQuotationHtml(
      {
        ...data,
        validityDays: null,
        warrantyPartsMonths: null,
        warrantyFreeServiceMonths: null,
        deliveryDays: null,
      },
      branding,
    );
    expect(bare).not.toContain('Offer validity');
    expect(bare).not.toContain('Delivery time');
  });

  it('appends the tenant boilerplate in order, then the component table', () => {
    const html = buildQuotationHtml(
      {
        ...data,
        boilerplate: [
          { title: 'Scope of supply', body: 'One passenger elevator.' },
          { title: 'Exclusions', body: 'Civil work.' },
        ],
        components: [
          {
            sequence: 1,
            componentName: 'Traction machine',
            brand: 'Montanari',
            remark: 'Italy',
          },
        ],
      },
      branding,
    );
    expect(html.indexOf('Scope of supply')).toBeLessThan(
      html.indexOf('Exclusions'),
    );
    expect(html.indexOf('Exclusions')).toBeLessThan(
      html.indexOf('Component Specification'),
    );
    expect(html).toContain('Montanari');
  });

  it('escapes boilerplate prose and component names — tenant content is still untrusted', () => {
    const html = buildQuotationHtml(
      {
        ...data,
        boilerplate: [{ title: '<script>x</script>', body: '<b>bold</b>' }],
        components: [
          {
            sequence: 1,
            componentName: '<img src=x>',
            brand: null,
            remark: null,
          },
        ],
      },
      branding,
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });

  // "Prepared by" was never on the client's paper — we invented the label,
  // and it printed whoever was logged in (a quote typed by the CEO said
  // "Demo CEO"). Removed 2026-09-22; the salespeople are named by the
  // reference code instead.
  it('names the project in the parties block — never the customer, never a "Prepared by" line', () => {
    const html = buildQuotationHtml(
      { ...data, preparedByName: 'Abebe Kebede' },
      branding,
    );
    expect(html).toContain('Rodas Tower — Bole');
    expect(html).not.toContain('Prepared by');
    expect(html).not.toContain('Abebe Kebede');
    expect(html).not.toContain('Rodas Real Estate PLC');
  });

  it('prints the single line a quotation with no line items implies', () => {
    const html = buildQuotationHtml({ ...data, lines: [] }, branding);
    expect(html).toContain('No of Units');
    expect(html).toContain('>6,813,043.48</td>'); // the unit price IS the ex-VAT total
    expect(html).toContain('Passenger elevator');
  });
});

describe('monthsLabel', () => {
  it('states a whole number of years as years, and anything else as months', () => {
    expect(monthsLabel(60)).toBe('5 years');
    expect(monthsLabel(12)).toBe('1 year');
    expect(monthsLabel(18)).toBe('18 months');
    expect(monthsLabel(1)).toBe('1 month');
    expect(monthsLabel(0)).toBe('0 months');
  });
});

describe('documentReferenceCode', () => {
  it('joins the salespeople and the model code the way their own quotation writes it', () => {
    expect(documentReferenceCode('KALKIDAN AND MIKA', 'FUJI-E22')).toBe(
      'KALKIDAN AND MIKA FUJI-E22',
    );
  });

  it('prints the sales name alone when there is no model code', () => {
    expect(documentReferenceCode('KALKIDAN AND MIKA', null)).toBe(
      'KALKIDAN AND MIKA',
    );
  });

  it('prints the code alone on an old quotation that has no sales name', () => {
    expect(documentReferenceCode(null, 'FUJI-E22')).toBe('FUJI-E22');
    // Blank and whitespace are the same as absent — the row is a value, not
    // a stray space.
    expect(documentReferenceCode('  ', ' FUJI-E22 ')).toBe('FUJI-E22');
  });

  it('is null when neither is set, so the Reference code row is not printed', () => {
    expect(documentReferenceCode(null, null)).toBeNull();
    expect(documentReferenceCode(undefined, undefined)).toBeNull();
    expect(documentReferenceCode('', '   ')).toBeNull();
  });
});
