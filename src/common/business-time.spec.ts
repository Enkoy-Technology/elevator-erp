import { todayIso } from './business-time';

describe('todayIso', () => {
  it('rolls over to the next Addis calendar day before UTC midnight', () => {
    // EAT is UTC+3, so 22:30Z is 01:30 the next day in Addis Ababa.
    expect(todayIso(new Date('2026-08-07T22:30:00Z'))).toBe('2026-08-08');
  });

  it('stays on the same day mid-afternoon UTC', () => {
    expect(todayIso(new Date('2026-08-07T12:00:00Z'))).toBe('2026-08-07');
  });
});
