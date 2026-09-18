import type { TenantBranding } from '../document-pdf.service';
import { buildContractHtml, type ContractTemplateData } from './contract.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#FB9D19',
  taxId: '0071116691',
};

const draft: ContractTemplateData = {
  contractNumber: 'CNT-FY2026-27-0001',
  status: 'DRAFT',
  issuedAt: '2026-08-01',
  signedAt: null,
  customerName: 'Acme Real Estate PLC',
  customer: { address: 'Lemi Kura, Addis Ababa', phone: '+251933030116', tin: '0067673517' },
  projectName: 'Bole Twin Towers',
  contractValueEtb: '4500000.00',
  equipment: [
    {
      quantity: 2,
      productType: 'PASSENGER',
      specSummary: '630KG - 8 persons / Speed 1.0m/s / G+7',
      machineRoomLabel: 'WITH MR',
      tractionMachineType: 'Gearless',
      controlSystem: 'Simplex',
      powerSupply: '380V AC 50HZ 3-phase',
    },
  ],
  instalments: [
    { label: 'Advance on signing', amountEtb: '3600000.00', dueDate: '2026-08-14' },
    { label: 'On commissioning', amountEtb: '900000.00', dueDate: null },
  ],
  scopeOfWork: 'Brand: FUJI. Automatic Rescue Device included.',
  termsAndConditions: 'Retention of 10% for twelve months.',
  warrantyMonths: 60,
  deliveryWorkingDays: 90,
  installationWorkingDays: 15,
  delayPenaltyPercentPerDay: '0.020',
  delayPenaltyCapPercent: '5.00',
  advanceGuaranteeRequired: true,
  freeMaintenanceMonths: 12,
  disputeForum: 'the Addis Ababa Chamber of Commerce and Sectoral Associations',
};

const signed: ContractTemplateData = {
  ...draft,
  status: 'SIGNED',
  signedAt: '2026-08-14',
};

describe('buildContractHtml', () => {
  it('titles a DRAFT "CONTRACT DRAFT" and prints no signature date', () => {
    const html = buildContractHtml(draft, branding);
    expect(html).toContain('CONTRACT DRAFT');
    expect(html).toContain('Drafted');
    expect(html).not.toContain('Signed</div>');
    expect(html).not.toContain('2026-08-14.');
    expect(html).toContain('not binding');
  });

  it('titles a SIGNED contract "CONTRACT" and prints the signed date', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).not.toContain('CONTRACT DRAFT');
    expect(html).toContain('signed by both parties on 2026-08-14');
    expect(html).not.toContain('Drafted');
    expect(html).not.toContain('not binding');
  });

  it('prints both parties with address, phone and TIN', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('Shining Star Electromechanical Works');
    expect(html).toContain('TIN: 0071116691');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('TIN: 0067673517');
    expect(html).toContain('Tel: +251933030116');
    expect(html).toContain('Bole Twin Towers');
  });

  it('prints the equipment from the proforma lines and the scope text', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('630KG - 8 persons / Speed 1.0m/s / G+7');
    expect(html).toContain('WITH MR / Gearless / Simplex / 380V AC 50HZ 3-phase');
    expect(html).toContain('Automatic Rescue Device included.');
  });

  it('prints the contract value as figures and as words', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('4,500,000.00 ETB');
    expect(html).toContain('Four million five hundred thousand Birr');
  });

  it('prints the payment schedule with each instalment share', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('Advance on signing');
    expect(html).toContain('80%');
    expect(html).toContain('3,600,000.00 ETB');
    expect(html).toContain('20%');
    expect(html).toContain('guarantee cheque');
  });

  it('prints the numbered clauses from the typed fields', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('within 90 working days from the Effective Date');
    expect(html).toContain('within 15 working days');
    expect(html).toContain('60 months from the date of handover');
    expect(html).toContain('12 months of monthly preventive service');
    expect(html).toContain('0.02% of the Contract Price for each day of delay');
    expect(html).toContain('up to a maximum of 5%');
    expect(html).toContain('Addis Ababa Chamber of Commerce');
    expect(html).toContain('Article 9: Additional Terms');
    expect(html).toContain('Retention of 10% for twelve months.');
  });

  it('falls back to neutral wording when a clause carries no figure', () => {
    const html = buildContractHtml(
      {
        ...signed,
        equipment: [],
        instalments: [],
        warrantyMonths: null,
        deliveryWorkingDays: null,
        installationWorkingDays: null,
        delayPenaltyPercentPerDay: null,
        delayPenaltyCapPercent: null,
        advanceGuaranteeRequired: false,
        freeMaintenanceMonths: null,
        disputeForum: null,
        termsAndConditions: null,
        scopeOfWork: null,
      },
      branding,
    );
    expect(html).toContain('As specified in the attached proforma.');
    expect(html).toContain('Payment falls due as stated in the attached proforma.');
    expect(html).toContain('Warranty: as stated in the attached proforma');
    expect(html).toContain('the competent court');
    expect(html).not.toContain('guarantee cheque');
    expect(html).not.toContain('preventive service');
    expect(html).not.toContain('Article 9');
  });

  it('prints two-party and witness signature blocks for wet signing', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('For the Supplier');
    expect(html).toContain('For the Client');
    expect(html).toContain('Witness 1');
    expect(html).toContain('Witness 2');
  });

  it('escapes customer-controlled text', () => {
    const html = buildContractHtml(
      {
        ...signed,
        customerName: '<img src=x onerror=alert(1)>',
        disputeForum: '<script>x</script>',
      },
      branding,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<script>');
  });
});

describe('contract instalment table — Due column', () => {
  it('omits the Due column when no instalment has a date (event-based schedule from the proforma)', () => {
    const html = buildContractHtml(
      {
        ...signed,
        instalments: [
          { label: 'Advance on signing', amountEtb: '3600000.00', dueDate: null },
          { label: 'On commissioning', amountEtb: '900000.00', dueDate: null },
        ],
      },
      branding,
    );
    expect(html).not.toContain('<th>Due</th>');
  });

  it('keeps the Due column once any instalment is dated', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('<th>Due</th>');
  });
});
