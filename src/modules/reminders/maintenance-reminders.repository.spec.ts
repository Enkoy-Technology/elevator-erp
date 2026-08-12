import { reminderWindowBounds } from './maintenance-reminders.repository';

describe('reminderWindowBounds', () => {
  it('the upper bound is exactly windowDays out from today', () => {
    expect(reminderWindowBounds('2026-08-08', 3)).toEqual({
      from: '2026-08-08',
      to: '2026-08-11',
    });
  });

  it('a nextServiceAt exactly windowDays out is INSIDE the window', () => {
    const { from, to } = reminderWindowBounds('2026-08-08', 3);
    const exactlyWindowDaysOut = '2026-08-11';
    expect(exactlyWindowDaysOut >= from && exactlyWindowDaysOut <= to).toBe(true);
  });

  it('a nextServiceAt windowDays+1 out is OUTSIDE the window', () => {
    const { from, to } = reminderWindowBounds('2026-08-08', 3);
    const oneDayTooFar = '2026-08-12';
    expect(oneDayTooFar >= from && oneDayTooFar <= to).toBe(false);
  });

  it('today itself is inside the window (windowDays=0 still catches same-day service)', () => {
    const { from, to } = reminderWindowBounds('2026-08-08', 0);
    expect(from).toBe('2026-08-08');
    expect(to).toBe('2026-08-08');
  });

  it('handles a month boundary correctly (calendar-aware, not a naive digit increment)', () => {
    expect(reminderWindowBounds('2026-08-30', 3)).toEqual({
      from: '2026-08-30',
      to: '2026-09-02',
    });
  });
});
