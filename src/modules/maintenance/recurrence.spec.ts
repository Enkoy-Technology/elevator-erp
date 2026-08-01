import {
  advanceServiceDate,
  nextServiceDateAfter,
  toIsoDate,
} from './recurrence';

describe('advanceServiceDate', () => {
  it('advances by days for the short recurrences', () => {
    expect(advanceServiceDate('2026-03-10', 'DAILY')).toBe('2026-03-11');
    expect(advanceServiceDate('2026-03-10', 'WEEKLY')).toBe('2026-03-17');
    expect(advanceServiceDate('2026-03-10', 'BIWEEKLY')).toBe('2026-03-24');
  });

  it('advances by months and years', () => {
    expect(advanceServiceDate('2026-03-10', 'MONTHLY')).toBe('2026-04-10');
    expect(advanceServiceDate('2026-03-10', 'QUARTERLY')).toBe('2026-06-10');
    expect(advanceServiceDate('2026-03-10', 'BIANNUAL')).toBe('2026-09-10');
    expect(advanceServiceDate('2026-03-10', 'ANNUAL')).toBe('2027-03-10');
  });

  it('clamps month-end dates instead of skipping a month', () => {
    // Naive setUTCMonth would give 2026-03-03 and skip February entirely.
    expect(advanceServiceDate('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
    expect(advanceServiceDate('2026-08-31', 'MONTHLY')).toBe('2026-09-30');
    expect(advanceServiceDate('2024-02-29', 'ANNUAL')).toBe('2025-02-28');
  });

  it('crosses year boundaries', () => {
    expect(advanceServiceDate('2026-12-20', 'MONTHLY')).toBe('2027-01-20');
    expect(advanceServiceDate('2026-12-31', 'DAILY')).toBe('2027-01-01');
  });
});

describe('nextServiceDateAfter', () => {
  it('anchors to the schedule when the visit is on time or early', () => {
    expect(nextServiceDateAfter('2026-03-10', '2026-03-10', 'MONTHLY')).toBe(
      '2026-04-10',
    );
    expect(nextServiceDateAfter('2026-03-10', '2026-03-05', 'MONTHLY')).toBe(
      '2026-04-10',
    );
  });

  it('does not drift when the visit happens late', () => {
    // Scheduled the 10th, visited the 25th — next stays on the 10th cadence.
    expect(nextServiceDateAfter('2026-03-10', '2026-03-25', 'MONTHLY')).toBe(
      '2026-04-10',
    );
  });

  it('catches up when overdue by more than one interval', () => {
    expect(nextServiceDateAfter('2026-01-10', '2026-03-25', 'MONTHLY')).toBe(
      '2026-04-10',
    );
    expect(nextServiceDateAfter('2026-03-01', '2026-03-25', 'WEEKLY')).toBe(
      '2026-03-29',
    );
  });
});

describe('toIsoDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date('2026-07-28T21:45:00.000Z'))).toBe('2026-07-28');
  });
});
