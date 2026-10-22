import type { TenantBranding } from '../document-pdf.service';
import {
  buildTechnicalProposalHtml,
  type TechnicalProposalTemplateData,
} from './technical-proposal.template';

const branding: TenantBranding = {
  name: 'Enkoy Elevators PLC',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#123456',
};

const passenger: TechnicalProposalTemplateData = {
  quoteNumber: 'QTN-2026-ABCD1234',
  status: 'APPROVED',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  customerName: 'Acme Real Estate PLC',
  projectName: 'Bole Twin Towers — Lift A',
  preparedByName: 'Sara Tesfaye',
  calcInput: {
    productType: 'PASSENGER',
    capacityKg: 1000,
    stops: 8,
    travelHeightM: 24,
    speedMs: 1.6,
    machineRoomType: 'MRL',
    doorType: 'CENTER_OPEN',
    doorWidthMm: 900,
    buildingUsage: 'COMMERCIAL',
  },
  technicalSpec: {
    productType: 'PASSENGER',
    capacityPersons: 13,
    carWidthMm: 1600,
    carDepthMm: 1400,
    carHeightMm: 2300,
    shaftWidthMm: 2000,
    shaftDepthMm: 1800,
    pitDepthMm: 1600,
    overheadClearanceMm: 4200,
    counterweightMassKg: '1350.00',
    motorPowerKw: '11.00',
    guideRailSpec: 'T89/B',
    machineRoomWidthMm: null,
    machineRoomDepthMm: null,
    machineRoomHeightMm: null,
  },
};

const flat: TechnicalProposalTemplateData = {
  quoteNumber: 'QTN-2026-EF567890',
  status: 'DRAFT',
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
  customerName: 'Edna Mall',
  projectName: 'Escalator bank',
  calcInput: { productType: 'ESCALATOR', stops: 2, travelHeightM: 4.5 },
  technicalSpec: {
    productType: 'ESCALATOR',
    capacityPersons: null,
    carWidthMm: null,
    carDepthMm: null,
    carHeightMm: null,
    shaftWidthMm: null,
    shaftDepthMm: null,
    pitDepthMm: null,
    overheadClearanceMm: null,
    counterweightMassKg: null,
    motorPowerKw: null,
    guideRailSpec: null,
    machineRoomWidthMm: null,
    machineRoomDepthMm: null,
    machineRoomHeightMm: null,
  },
};

describe('buildTechnicalProposalHtml', () => {
  it('titles the document and plates the quotation and project — never the customer', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).toContain('TECHNICAL PROPOSAL');
    expect(html).toContain('QTN-2026-ABCD1234');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('Enkoy Elevators PLC');
    expect(html).not.toContain('Acme Real Estate PLC');
  });

  // Removed 2026-09-22: never on the client's paper, and it named whoever
  // was logged in rather than the salespeople.
  it('never prints a Prepared by line, even when the author is known', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).not.toContain('Prepared by');
    expect(html).not.toContain('Sara Tesfaye');
    expect(html).toContain('Bole Twin Towers');
  });

  it('prints the four specs the quotation PDF omits', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).toContain('Car height');
    expect(html).toContain('2300 mm');
    expect(html).toContain('Overhead clearance');
    expect(html).toContain('4200 mm');
    expect(html).toContain('Counterweight mass');
    expect(html).toContain('1350.00 kg');
  });

  it('drops the machine room rows on an MRL machine (null geometry never prints)', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).not.toContain('Machine room width');
    expect(html).toContain('Passenger elevator');
  });

  it('renders the duty parameters the geometry was computed from', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).toContain('Rated load');
    expect(html).toContain('1000 kg');
    expect(html).toContain('Rated speed');
    expect(html).toContain('1.6 m/s');
    expect(html).toContain('Center open');
    expect(html).toContain('MRL');
  });

  it('carries no pricing', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    // 'ETB' is not asserted on: the embedded Ethiopic font blob in the shared
    // layout contains that byte sequence. These are the words a price block
    // would actually put on the page.
    expect(html).not.toContain('Pricing');
    expect(html).not.toContain('Margin');
    expect(html).not.toContain('Total');
  });

  it('replaces the geometry table with an honest line for a flat-priced product', () => {
    const html = buildTechnicalProposalHtml(flat, branding);
    expect(html).toContain('no EN 81 lift geometry');
    expect(html).toContain('flat-priced escalator');
    expect(html).not.toContain('Car width');
    expect(html).not.toContain('Guide rail');
  });

  it('escapes HTML in the project name', () => {
    const html = buildTechnicalProposalHtml(
      { ...passenger, projectName: '<b>x</b>' },
      branding,
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildTechnicalProposalHtml(passenger, null);
    expect(html).toContain('#1B2A4A');
  });
});

/**
 * What the calculator really stores for these products
 * (elevator-calc.service.ts): the escalator's capacityKg 0 placeholder and
 * its width in shaftWidthMm, a vehicle lift's platform in
 * carWidthMm/carDepthMm.
 */
describe('buildTechnicalProposalHtml for an escalator and the vehicle lifts', () => {
  const geometry = flat.technicalSpec ?? {};
  const row = (label: string, value: string): string =>
    `<tr><td>${label}</td><td class="num">${value}</td></tr>`;

  it('keeps the passenger labels and duty rows', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).toContain(row('Car width', '1600 mm'));
    expect(html).toContain(row('Shaft width', '2000 mm'));
    expect(html).toContain(row('Number of stops', '8'));
    expect(html).toContain(row('Building usage', 'Commercial'));
    expect(html).not.toContain('Platform width');
  });

  it('prints an escalator with no rated load, no stops and no building usage, and its width as Width', () => {
    const html = buildTechnicalProposalHtml(
      {
        ...flat,
        calcInput: {
          productType: 'ESCALATOR',
          capacityKg: 0,
          stops: 2,
          travelHeightM: 5,
          speedMs: 0.5,
          doorType: 'CENTER_OPEN',
          doorWidthMm: 0,
          buildingUsage: 'COMMERCIAL',
          shaftWidthMm: 1000,
        },
        technicalSpec: { ...geometry, shaftWidthMm: 1000 },
      },
      branding,
    );
    expect(html).toContain(row('Width', '1000 mm'));
    expect(html).toContain(row('Travel height', '5 m'));
    expect(html).toContain(row('Rated speed', '0.5 m/s'));
    expect(html).not.toContain('Rated load');
    expect(html).not.toContain('0 kg');
    expect(html).not.toContain('Number of stops');
    expect(html).not.toContain('Building usage');
    expect(html).not.toContain('Shaft width');
  });

  it("calls a car stacking lift's stops its parking levels, as page 2 does", () => {
    const html = buildTechnicalProposalHtml(
      {
        ...flat,
        calcInput: {
          productType: 'CAR_STACKING_LIFT',
          capacityKg: 3500,
          stops: 2,
          speedMs: 0.15,
          machineRoomType: 'MR',
        },
        technicalSpec: { ...geometry, productType: 'CAR_STACKING_LIFT' },
      },
      branding,
    );
    expect(html).toContain(row('Parking levels', '2'));
    expect(html).not.toContain('Number of stops');
  });

  it.each([
    ['CAR_LIFT', 2800, 5600],
    ['CAR_PLATFORM_LIFT', 2500, 5000],
    ['CAR_STACKING_LIFT', 2800, 5500],
  ])('labels the %s platform as the platform, not a car', (product, w, d) => {
    const html = buildTechnicalProposalHtml(
      {
        ...flat,
        calcInput: {
          productType: product,
          capacityKg: 3500,
          stops: 2,
          travelHeightM: 7,
          speedMs: 0.3,
          machineRoomType: 'MR',
          buildingUsage: 'COMMERCIAL',
        },
        technicalSpec: {
          ...geometry,
          productType: product,
          carWidthMm: w,
          carDepthMm: d,
          shaftWidthMm: 3400,
          shaftDepthMm: 6500,
        },
      },
      branding,
    );
    expect(html).toContain(row('Rated load', '3500 kg'));
    expect(html).toContain(row('Platform width', `${w} mm`));
    expect(html).toContain(row('Platform depth', `${d} mm`));
    expect(html).toContain(row('Shaft width', '3400 mm'));
    expect(html).not.toContain('Car width');
    expect(html).not.toContain('Car depth');
  });
});
