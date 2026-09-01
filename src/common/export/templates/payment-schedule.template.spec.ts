import type { TenantBranding } from '../document-pdf.service';
import {
  buildPaymentScheduleHtml,
  type PaymentScheduleTemplateData,
} from './payment-schedule.template';

describe('buildPaymentScheduleHtml', () => {
  const branding: TenantBranding = {
    name: 'Shining Star Electromechanical Works',
    slogan: 'Lifting Ethiopia',
    logoUrl: null,
    address: 'Bole Road, Addis Ababa',
    phones: ['+251 11 123 4567'],
    primaryColor: '#FB9D19',
  };

  const data: PaymentScheduleTemplateData = {
    contractNumber: 'CNT-FY2026-27-0001',
    contractDate: '2026-09-01',
    status: 'SIGNED',
    customerName: 'Acme Real Estate PLC',
    projectName: 'Bole Tower — 2 passenger lifts',
    contractValueEtb: '1000000.00',
    scheduledTotalEtb: '1000000.00',
    instalments: [
      { sequence: 1, label: 'Advance on signing', dueDate: '2026-09-05', amountEtb: '200000.00' },
      { sequence: 2, label: 'On delivery to site', dueDate: '2026-11-30', amountEtb: '700000.00' },
      { sequence: 3, label: 'Retention, on handover', dueDate: null, amountEtb: '100000.00' },
    ],
  };

  it('titles the document PAYMENT SCHEDULE and carries the letterhead', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).toContain('PAYMENT SCHEDULE');
    expect(html).toContain('Shining Star Electromechanical Works');
  });

  it('references the contract and the customer', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).toContain('CNT-FY2026-27-0001');
    expect(html).toContain('Acme Real Estate PLC');
    expect(html).toContain('Bole Tower');
  });

  it('numbers each instalment and prints its label, due date and amount', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).toContain('Advance on signing');
    expect(html).toContain('2026-09-05');
    expect(html).toContain('200,000.00 ETB');
    expect(html).toContain('Retention, on handover');
    // A milestone with no calendar date still prints a row.
    expect(html).toContain('<td>—</td>');
  });

  it('shows the scheduled total beside the contract value', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).toContain('Contract value');
    expect(html).toContain('Total scheduled');
    expect(html).toContain('1,000,000.00 ETB');
  });

  it('prints a signature line for each party, side by side in one block', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).toContain('For the contractor');
    expect(html).toContain('For the customer');
    // Both parties share ONE signature table. Two stacked tables print two
    // full-page-width rules, which is what this document used to do and what
    // made it the odd one out among the counter-signed documents.
    expect(html.match(/<table class="sign"/g)).toHaveLength(1);
  });

  it('keeps the customer bookkeeping out of the customer document', () => {
    const html = buildPaymentScheduleHtml(data, branding);
    expect(html).not.toContain('PENDING');
    expect(html).not.toContain('INVOICED');
  });

  it('renders a placeholder when no instalments have been agreed', () => {
    const html = buildPaymentScheduleHtml({ ...data, instalments: [] }, branding);
    expect(html).toContain('No instalments have been agreed');
  });

  it('escapes HTML in the customer name and instalment labels', () => {
    const html = buildPaymentScheduleHtml(
      {
        ...data,
        customerName: '<script>x</script>',
        instalments: [{ sequence: 1, label: '<b>y</b>', dueDate: null, amountEtb: '1000000.00' }],
      },
      branding,
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>y</b>');
  });

  it('renders without branding configured', () => {
    expect(buildPaymentScheduleHtml(data, null)).toContain('PAYMENT SCHEDULE');
  });
});
