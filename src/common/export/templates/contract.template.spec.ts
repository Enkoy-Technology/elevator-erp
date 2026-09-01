import type { TenantBranding } from '../document-pdf.service';
import { buildContractHtml, type ContractTemplateData } from './contract.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#FB9D19',
};

const draft: ContractTemplateData = {
  contractNumber: 'CNT-FY2026-27-0001',
  status: 'DRAFT',
  issuedAt: '2026-08-01',
  signedAt: null,
  customerName: 'Acme Real Estate PLC',
  projectName: 'Bole Twin Towers',
  contractValueEtb: '4500000.00',
  scopeOfWork: 'Supply and installation of two 8-person passenger elevators.\nSix stops each.',
  termsAndConditions: '40% advance on signing.\nRetention of 10% for twelve months.',
  warrantyMonths: 12,
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
    expect(html).not.toContain('2026-08-14');
    expect(html).toContain('not binding');
  });

  it('titles a SIGNED contract "CONTRACT" and prints the signed date', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).not.toContain('CONTRACT DRAFT');
    expect(html).toContain('2026-08-14');
    expect(html).not.toContain('Drafted');
    expect(html).not.toContain('not binding');
  });

  it('prints both parties, the scope, the terms and the warranty period', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('Shining Star Electromechanical Works');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('Six stops each.');
    expect(html).toContain('Retention of 10% for twelve months.');
    expect(html).toContain('12 months');
  });

  it('prints the contract value as figures and as words', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('4,500,000.00 ETB');
    expect(html).toContain('Four million five hundred thousand Birr');
  });

  it('omits the warranty section entirely when the contract carries none', () => {
    const html = buildContractHtml({ ...signed, warrantyMonths: null }, branding);
    expect(html).not.toContain('Warranty');
  });

  it('prints an em dash for an unfilled scope rather than dropping the section', () => {
    const html = buildContractHtml(
      { ...draft, scopeOfWork: null, termsAndConditions: null },
      branding,
    );
    expect(html).toContain('Scope of Work');
    expect(html).toContain('Terms and Conditions');
    expect(html).toContain('&mdash;');
  });

  it('prints a two-party signature block for wet signing', () => {
    const html = buildContractHtml(signed, branding);
    expect(html).toContain('For the Contractor');
    expect(html).toContain('For the Client');
  });

  it('escapes customer-controlled text', () => {
    const html = buildContractHtml(
      { ...signed, customerName: '<img src=x onerror=alert(1)>' },
      branding,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
