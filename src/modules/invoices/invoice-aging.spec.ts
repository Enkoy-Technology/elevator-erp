import { bucketForDaysOverdue, daysOverdue, invoiceOutstandingEtb } from './invoice-aging';

describe('daysOverdue', () => {
  it('is 0 on the due date itself', () => {
    expect(daysOverdue('2026-08-08', '2026-08-08')).toBe(0);
  });

  it('is negative before the due date (not yet due)', () => {
    expect(daysOverdue('2026-08-20', '2026-08-08')).toBe(-12);
  });

  it('counts whole calendar days past the due date', () => {
    expect(daysOverdue('2026-08-08', '2026-09-07')).toBe(30);
  });
});

describe('bucketForDaysOverdue — boundaries pinned exactly as the brief specifies', () => {
  it('not yet due or due today (<= 0) is current', () => {
    expect(bucketForDaysOverdue(-5)).toBe('current');
    expect(bucketForDaysOverdue(0)).toBe('current');
  });

  it('1 day overdue is d1_30', () => {
    expect(bucketForDaysOverdue(1)).toBe('d1_30');
  });

  it('exactly 30 days overdue is still d1_30', () => {
    expect(bucketForDaysOverdue(30)).toBe('d1_30');
  });

  it('exactly 31 days overdue rolls into d31_60', () => {
    expect(bucketForDaysOverdue(31)).toBe('d31_60');
  });

  it('exactly 60 days overdue is still d31_60', () => {
    expect(bucketForDaysOverdue(60)).toBe('d31_60');
  });

  it('exactly 61 days overdue rolls into d61_90', () => {
    expect(bucketForDaysOverdue(61)).toBe('d61_90');
  });

  it('exactly 90 days overdue is still d61_90', () => {
    expect(bucketForDaysOverdue(90)).toBe('d61_90');
  });

  it('exactly 91 days overdue rolls into d90_plus', () => {
    expect(bucketForDaysOverdue(91)).toBe('d90_plus');
  });

  it('far past 91 days stays d90_plus', () => {
    expect(bucketForDaysOverdue(500)).toBe('d90_plus');
  });
});

describe('invoiceOutstandingEtb — the one formula agingReport/withOutstanding/recomputeCustomerBalance agree on', () => {
  it('totalEtb minus whtEtb minus allocations', () => {
    const result = invoiceOutstandingEtb({
      totalEtb: '1000.00',
      whtEtb: '20.00',
      allocatedEtb: '300.00',
    });
    expect(result.toFixed(2)).toBe('680.00');
  });

  it('defaults cleanly when nothing has been allocated yet', () => {
    const result = invoiceOutstandingEtb({
      totalEtb: '500.00',
      whtEtb: '0',
      allocatedEtb: '0',
    });
    expect(result.toFixed(2)).toBe('500.00');
  });

  it('can go to exactly zero once fully settled', () => {
    const result = invoiceOutstandingEtb({
      totalEtb: '500.00',
      whtEtb: '50.00',
      allocatedEtb: '450.00',
    });
    expect(result.isZero()).toBe(true);
  });
});
