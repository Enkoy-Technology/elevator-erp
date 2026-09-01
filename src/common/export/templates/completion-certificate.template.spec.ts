import type { TenantBranding } from '../document-pdf.service';
import {
  buildCompletionCertificateHtml,
  type CompletionCertificateTemplateData,
} from './completion-certificate.template';

const branding: TenantBranding = {
  name: 'Shining Star Electromechanical Works',
  slogan: 'Lifting Ethiopia',
  logoUrl: null,
  address: 'Bole Road, Addis Ababa',
  phones: ['+251 11 123 4567'],
  primaryColor: '#FB9D19',
};

const data: CompletionCertificateTemplateData = {
  contractNumber: 'CNT-FY2026-27-0001',
  projectName: 'Bole Twin Towers',
  customerName: 'Acme Real Estate PLC',
  scopeOfWork: 'Supply and installation of one 8-person passenger elevator.\nSix stops.',
  handedOverAt: '2026-08-14',
  handedOverToName: 'Abebe Kebede',
  handoverNotes: 'Keys and logbook handed to building management.',
};

describe('buildCompletionCertificateHtml', () => {
  it('prints the contract and project reference, the customer, the handover and who accepted it', () => {
    const html = buildCompletionCertificateHtml(data, branding);
    expect(html).toContain('COMPLETION CERTIFICATE');
    expect(html).toContain('CNT-FY2026-27-0001');
    expect(html).toContain('Bole Twin Towers');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('2026-08-14');
    expect(html).toContain('Abebe Kebede');
    expect(html).toContain('Six stops.');
    expect(html).toContain('Keys and logbook handed to building management.');
  });

  it('prints a two-party signature block for wet signing', () => {
    const html = buildCompletionCertificateHtml(data, branding);
    expect(html).toContain('For the contractor');
    expect(html).toContain('For the customer');
  });

  it('prints an em dash for an empty scope rather than dropping the section', () => {
    const html = buildCompletionCertificateHtml(
      { ...data, scopeOfWork: null, handoverNotes: null },
      branding,
    );
    expect(html).toContain('Scope of Work Delivered');
    expect(html).toContain('Handover Notes');
    expect(html).toContain('&mdash;');
  });

  it('escapes customer-controlled text', () => {
    const html = buildCompletionCertificateHtml(
      { ...data, handedOverToName: '<img src=x onerror=alert(1)>' },
      branding,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
