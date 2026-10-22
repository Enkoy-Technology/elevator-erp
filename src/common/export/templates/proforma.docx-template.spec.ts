import { Document } from 'docx';

import type { TenantBranding } from '../document-pdf.service';
import { buildProformaDocx } from './proforma.docx-template';
import type { ProformaTemplateData } from './proforma.template';

describe('buildProformaDocx', () => {
  const branding: TenantBranding = {
    name: 'Enkoy Elevators PLC',
    slogan: 'Lifting Ethiopia',
    logoUrl: 'https://cdn.example.com/logo.png',
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#123456',
  };

  const data: ProformaTemplateData = {
    proformaNumber: 'PF-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: new Date('2026-09-30T00:00:00.000Z'),
    taxPercent: '15.00',
    subtotalEtb: '100000.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
    notes: 'Bank transfer only',
    technicalSpec: { capacityPersons: 13, motorPowerKw: '11.00' },
    projectName: 'Bole Twin Towers — Lift A',
    customerName: 'Acme Real Estate PLC',
    preparedByName: 'Abebe Kebede',
  };

  // The unpacked Document serialises its text runs verbatim, so a substring
  // check on the JSON is enough to see what the party block prints — no zip
  // reader needed.
  const text = (d: ProformaTemplateData): string =>
    JSON.stringify(buildProformaDocx(d, branding));

  it('returns a docx Document instance', () => {
    expect(buildProformaDocx(data, branding)).toBeInstanceOf(Document);
  });

  it('names the project in the party block — never the customer, never a Prepared by line', () => {
    const json = text(data);
    expect(json).toContain('Bole Twin Towers — Lift A');
    // Removed 2026-09-22: the label was never on the client's paper.
    expect(json).not.toContain('Prepared by');
    expect(json).not.toContain('Abebe Kebede');
    expect(json).not.toContain('Acme Real Estate PLC');
  });

  it('plates the reference code the PDF prints, sales name and all', () => {
    const json = text({
      ...data,
      salesName: 'KALKIDAN AND MIKA',
      referenceCode: 'FUJI-E22',
    });
    expect(json).toContain('KALKIDAN AND MIKA FUJI-E22');
    // Nothing to print, no row: the plate stays four fields wide.
    expect(text(data)).not.toContain('Reference code');
  });

  // The Word proforma used to skip the Product row's format and print the
  // raw code; and a vehicle's platform is not a car, nor an escalator's
  // width a shaft.
  it('names the product and labels a vehicle platform and an escalator width by name', () => {
    const stacking = text({
      ...data,
      technicalSpec: {
        productType: 'CAR_STACKING_LIFT',
        carWidthMm: 2800,
        carDepthMm: 5500,
        shaftWidthMm: 3200,
        shaftDepthMm: 5800,
      },
    });
    expect(stacking).toContain('Car stacking lift');
    expect(stacking).not.toContain('CAR_STACKING_LIFT');
    expect(stacking).toContain('Platform width');
    expect(stacking).toContain('Platform depth');
    expect(stacking).not.toContain('Car width');

    const escalator = text({
      ...data,
      technicalSpec: { productType: 'ESCALATOR', shaftWidthMm: 1000 },
    });
    expect(escalator).toContain('"Width"');
    expect(escalator).not.toContain('Shaft width');

    const passenger = text({
      ...data,
      technicalSpec: { productType: 'PASSENGER', carWidthMm: 1400 },
    });
    expect(passenger).toContain('Passenger elevator');
    expect(passenger).toContain('Car width');
  });

  it('does not throw when branding is absent', () => {
    expect(() => buildProformaDocx(data, null)).not.toThrow();
  });

  it('does not throw when technicalSpec/pricingBreakdown/notes are absent', () => {
    const minimal: ProformaTemplateData = {
      proformaNumber: 'PF-FY2026-27-0002',
      status: 'ISSUED',
      customerName: 'Test Customer',
      projectName: 'Test Project',
    };
    expect(() => buildProformaDocx(minimal, branding)).not.toThrow();
  });

  it('does not throw on a 3-digit hex primaryColor (same docx hex-validator regression as the quotation template)', () => {
    expect(() =>
      buildProformaDocx(data, { ...branding, primaryColor: '#abc' }),
    ).not.toThrow();
  });
});
