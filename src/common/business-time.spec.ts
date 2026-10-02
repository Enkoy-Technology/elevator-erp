import {
  addWorkingDaysIso,
  daysBetweenIso,
  todayIso,
  workingDaysBetweenIso,
} from './business-time';

describe('todayIso', () => {
  it('rolls over to the next Addis calendar day before UTC midnight', () => {
    // EAT is UTC+3, so 22:30Z is 01:30 the next day in Addis Ababa.
    expect(todayIso(new Date('2026-08-07T22:30:00Z'))).toBe('2026-08-08');
  });

  it('stays on the same day mid-afternoon UTC', () => {
    expect(todayIso(new Date('2026-08-07T12:00:00Z'))).toBe('2026-08-07');
  });
});

describe('addWorkingDaysIso / workingDaysBetweenIso', () => {
  it('skips Saturdays and Sundays: 90 working days from Thu 24 Sep 2026 is 18 weeks on', () => {
    expect(addWorkingDaysIso('2026-09-24', 90)).toBe('2027-01-28');
    // Friday + 1 working day is Monday.
    expect(addWorkingDaysIso('2026-10-02', 1)).toBe('2026-10-05');
    expect(addWorkingDaysIso('2026-10-02', 0)).toBe('2026-10-02');
  });

  it('counts the working days left, and agrees with addWorkingDaysIso', () => {
    expect(workingDaysBetweenIso('2026-09-24', '2027-01-28')).toBe(90);
    expect(workingDaysBetweenIso('2026-10-02', '2027-01-28')).toBe(84);
    expect(workingDaysBetweenIso('2027-01-28', '2027-01-28')).toBe(0);
  });

  it('counts calendar days too, weekends included', () => {
    expect(daysBetweenIso('2026-09-22', '2026-10-02')).toBe(10);
    expect(daysBetweenIso('2026-10-02', '2026-09-22')).toBe(-10);
  });

  it('is negative once the date has passed, even across a weekend only', () => {
    // Due Friday, looked at on Saturday: overdue, not "due today".
    expect(workingDaysBetweenIso('2026-10-03', '2026-10-02')).toBe(-1);
    expect(workingDaysBetweenIso('2026-10-09', '2026-10-02')).toBe(-5);
  });
});
