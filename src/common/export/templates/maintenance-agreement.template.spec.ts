import type { TenantBranding } from '../document-pdf.service';
import {
  buildMaintenanceAgreementHtml,
  type MaintenanceAgreementTemplateData,
} from './maintenance-agreement.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: '',
  logoUrl: null,
  address: 'Bole, Woreda 14, Addis Ababa',
  phones: ['+251 985 064087'],
  primaryColor: '#FB9D19',
  taxId: '0071116691',
};

const data: MaintenanceAgreementTemplateData = {
  contractRef: 'a1b2c3d4-0000-0000-0000-000000000000',
  startDate: '2026-07-23',
  customerName: 'BHA',
  customerAddress: 'Kirkos, Woreda 03, Addis Ababa',
  customerPhone: '0911234110',
  customerTin: '0067673517',
  assetName: 'Passenger lift',
  buildingName: 'BHA Tower',
  assetSerialNumber: 'SG-2019-0042',
  specSummary: 'Brand: Sigma\nDrive: Gearless traction\nCapacity: 630 kg\nStops: 12 (2B+G+9)\nSpeed: 1.5 m/s',
  recurrence: 'MONTHLY',
  monthlyFeeEtb: '6900.00',
  feeIncludesVat: true,
  termMonths: 12,
  autoRenews: true,
  noticeDays: 30,
  cureDays: 7,
  scopeOfWork: null,
};

describe('buildMaintenanceAgreementHtml', () => {
  it('prints both parties with address, phone and TIN', () => {
    const html = buildMaintenanceAgreementHtml(data, branding);
    expect(html).toContain('MAINTENANCE &amp; SERVICE AGREEMENT');
    expect(html).toContain('BHA');
    expect(html).toContain('TIN: 0067673517');
    expect(html).toContain('Tel: 0911234110');
    expect(html).toContain('Shining Star Electromechanical Works');
    expect(html).toContain('TIN: 0071116691');
  });

  it('prints the elevator specification one attribute per line', () => {
    const html = buildMaintenanceAgreementHtml(data, branding);
    expect(html).toContain('Equipment: Passenger lift at BHA Tower');
    expect(html).toContain('Serial number: SG-2019-0042');
    expect(html).toContain('<li>Capacity: 630 kg</li>');
    expect(html).toContain('<li>Stops: 12 (2B+G+9)</li>');
  });

  it('prints the standard scope when the contract carries none, and the override when it does', () => {
    expect(buildMaintenanceAgreementHtml(data, branding)).toContain('normal wear and tear');
    const html = buildMaintenanceAgreementHtml(
      { ...data, scopeOfWork: 'Quarterly rope inspection only.' },
      branding,
    );
    expect(html).toContain('Quarterly rope inspection only.');
    expect(html).not.toContain('normal wear and tear');
  });

  it('prints the term, renewal, notice and cure clauses from the figures', () => {
    const html = buildMaintenanceAgreementHtml(data, branding);
    expect(html).toContain('commences on 2026-07-23');
    expect(html).toContain('initial term of 12 months');
    expect(html).toContain('30 days’ written notice');
    expect(html).toContain('within 7 days of written notice');
    expect(html).toContain('monthly schedule');
  });

  it('states a fixed term when the agreement does not auto-renew', () => {
    const html = buildMaintenanceAgreementHtml({ ...data, autoRenews: false }, branding);
    expect(html).toContain('ends when that term expires');
    expect(html).not.toContain('renews automatically');
  });

  it('prints the fee as figures and words, with the VAT wording', () => {
    const html = buildMaintenanceAgreementHtml(data, branding);
    expect(html).toContain('6,900.00 ETB');
    expect(html).toContain('Six thousand nine hundred Birr');
    expect(html).toContain('inclusive of VAT');
    expect(
      buildMaintenanceAgreementHtml({ ...data, feeIncludesVat: false }, branding),
    ).toContain('exclusive of VAT');
  });

  it('falls back to the quotation when no fee is recorded', () => {
    const html = buildMaintenanceAgreementHtml({ ...data, monthlyFeeEtb: null }, branding);
    expect(html).toContain('attached price quotation');
    expect(html).not.toContain('Monthly fee');
  });

  it('prints party and witness signature blocks', () => {
    const html = buildMaintenanceAgreementHtml(data, branding);
    expect(html).toContain('For the Client');
    expect(html).toContain('For the Service Provider');
    expect(html).toContain('Witness 2');
  });

  it('escapes customer-controlled text', () => {
    const html = buildMaintenanceAgreementHtml(
      { ...data, customerName: '<img src=x>', specSummary: '<b>bold</b>' },
      branding,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>bold</b>');
  });
});
