import type { TenantBranding } from '../document-pdf.service';
import {
  buildWarrantyCertificateHtml,
  warrantyWindow,
  type WarrantyCertificateTemplateData,
} from './warranty-certificate.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#FB9D19',
};

describe('warrantyWindow', () => {
  it('runs from the handover date when one is recorded', () => {
    expect(
      warrantyWindow({
        warrantyMonths: 12,
        handedOverAt: '2026-08-14',
        signedAt: '2025-03-01',
      }),
    ).toEqual({ basis: 'HANDOVER', startsOn: '2026-08-14', expiresOn: '2027-08-14' });
  });

  it('falls back to the signed date when a contract closed with no handover', () => {
    expect(
      warrantyWindow({ warrantyMonths: 6, handedOverAt: null, signedAt: '2026-01-31' }),
    ).toEqual({ basis: 'SIGNING', startsOn: '2026-01-31', expiresOn: '2026-07-31' });
  });

  // The whole reason this isn't a bare setUTCMonth: overflowing into the
  // next month hands the customer days of cover nobody agreed to.
  it('clamps to the last valid day instead of overflowing a short month', () => {
    expect(
      warrantyWindow({ warrantyMonths: 1, handedOverAt: '2026-01-31', signedAt: null })
        ?.expiresOn,
    ).toBe('2026-02-28');
  });

  it('returns null with no warrantyMonths, so the caller refuses to issue', () => {
    expect(
      warrantyWindow({
        warrantyMonths: null,
        handedOverAt: '2026-08-14',
        signedAt: '2026-01-01',
      }),
    ).toBeNull();
  });

  it('returns null when there is neither a handover nor a signing date to run from', () => {
    expect(
      warrantyWindow({ warrantyMonths: 12, handedOverAt: null, signedAt: null }),
    ).toBeNull();
  });
});

describe('buildWarrantyCertificateHtml', () => {
  const data: WarrantyCertificateTemplateData = {
    contractNumber: 'CNT-FY2026-27-0001',
    customerName: 'Acme Real Estate PLC',
    projectName: 'Bole Twin Towers',
    technicalSpec: { productType: 'PASSENGER', capacityPersons: 8, motorPowerKw: 7.5 },
    warrantyMonths: 24,
    warranty: { basis: 'HANDOVER', startsOn: '2026-08-14', expiresOn: '2028-08-14' },
  };

  it('prints the reference plate, the equipment and both computed dates', () => {
    const html = buildWarrantyCertificateHtml(data, branding);
    expect(html).toContain('WARRANTY CERTIFICATE');
    expect(html).toContain('CNT-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('24 months');
    expect(html).toContain('2026-08-14');
    expect(html).toContain('2028-08-14');
    expect(html).toContain('Passenger / hospital elevator');
  });

  it('states which date the period ran from', () => {
    expect(buildWarrantyCertificateHtml(data, branding)).toContain(
      'runs from the date the equipment was handed over',
    );
    expect(
      buildWarrantyCertificateHtml(
        { ...data, warranty: { ...data.warranty, basis: 'SIGNING' } },
        branding,
      ),
    ).toContain('No handover date was recorded');
  });

  it('escapes customer-controlled text', () => {
    const html = buildWarrantyCertificateHtml(
      { ...data, customerName: '<script>alert(1)</script>' },
      branding,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
