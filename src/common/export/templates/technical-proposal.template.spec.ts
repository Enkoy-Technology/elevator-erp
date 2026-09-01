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
  it('titles the document and plates the quotation, project, and customer', () => {
    const html = buildTechnicalProposalHtml(passenger, branding);
    expect(html).toContain('TECHNICAL PROPOSAL');
    expect(html).toContain('QTN-2026-ABCD1234');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Enkoy Elevators PLC');
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
    expect(html).toContain('Passenger / hospital elevator');
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

  it('escapes HTML in the customer name', () => {
    const html = buildTechnicalProposalHtml({ ...passenger, customerName: '<b>x</b>' }, branding);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('falls back to the default primary colour when branding is absent', () => {
    const html = buildTechnicalProposalHtml(passenger, null);
    expect(html).toContain('#1B2A4A');
  });
});
