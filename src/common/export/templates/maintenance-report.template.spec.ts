import type { TenantBranding } from '../document-pdf.service';
import {
  buildMaintenanceReportHtml,
  type MaintenanceReportTemplateData,
} from './maintenance-report.template';

describe('buildMaintenanceReportHtml', () => {
  const branding: TenantBranding = {
    name: 'Shining Star Electromechanical Works',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#FB9D19',
  };

  const data: MaintenanceReportTemplateData = {
    contractRef: 'MC-4F2A9C11',
    elevatorNumber: 'SN-00841',
    assetName: 'Lift A',
    buildingName: 'Bole Twin Towers',
    customerName: 'Acme Real Estate PLC',
    visitedAt: new Date('2026-08-14T07:30:00.000Z'),
    technicianName: 'Abebe Kebede',
    inspectionResults: 'Door operator within tolerance.\nBrake gap 0.6mm.',
    partsReplaced: 'Door roller x2',
    recommendations: 'Replace landing door guide shoes next visit.',
    notes: 'Building power was out for 20 minutes.',
  };

  it('titles the document and prints the reference plate, customer and technician', () => {
    const html = buildMaintenanceReportHtml(data, branding);
    expect(html).toContain('MAINTENANCE REPORT');
    expect(html).toContain('MC-4F2A9C11');
    expect(html).toContain('SN-00841');
    expect(html).toContain('2026-08-14');
    expect(html).toContain('Abebe Kebede');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Twin Towers');
  });

  it('renders each of the client form fields as its own labelled block', () => {
    const html = buildMaintenanceReportHtml(data, branding);
    expect(html).toContain('Inspection Results');
    expect(html).toContain('Brake gap 0.6mm.');
    expect(html).toContain('Parts Replaced');
    expect(html).toContain('Door roller x2');
    expect(html).toContain('Recommendations');
    expect(html).toContain('Replace landing door guide shoes next visit.');
    expect(html).toContain('Additional Notes');
    expect(html).toContain('Building power was out');
  });

  it('keeps the three form sections (but not the optional notes) when they are empty', () => {
    const html = buildMaintenanceReportHtml(
      {
        ...data,
        inspectionResults: null,
        partsReplaced: null,
        recommendations: null,
        notes: null,
      },
      branding,
    );
    expect(html).toContain('Inspection Results');
    expect(html).toContain('Parts Replaced');
    expect(html).toContain('Recommendations');
    expect(html).not.toContain('Additional Notes');
  });

  it('prints a signature rule for the customer to sign on paper', () => {
    const html = buildMaintenanceReportHtml(data, branding);
    expect(html).toContain('Customer signature');
    expect(html).toContain('Technician signature');
  });

  it('escapes free text rather than emitting it as markup', () => {
    const html = buildMaintenanceReportHtml(
      { ...data, recommendations: '<script>alert(1)</script>' },
      branding,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders with no branding configured', () => {
    const html = buildMaintenanceReportHtml(data, null);
    expect(html).toContain('MAINTENANCE REPORT');
    expect(html).toContain('Acme Real Estate PLC');
  });
});
