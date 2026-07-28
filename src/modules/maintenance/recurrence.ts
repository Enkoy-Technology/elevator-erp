import type { MaintenanceRecurrence } from './dto/maintenance.dto';

/** Last day of the month `date` currently sits in. */
const daysInMonth = (date: Date): number =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

/**
 * setUTCMonth overflows on short months — Jan 31 + 1 month lands on Mar 3 and
 * silently skips February. Clamp to the last valid day instead.
 */
const addMonths = (date: Date, months: number): void => {
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day, daysInMonth(date)));
};

/** Advance a YYYY-MM-DD service date by the contract recurrence. */
export const advanceServiceDate = (
  fromIsoDate: string,
  recurrence: MaintenanceRecurrence,
): string => {
  const [year, month, day] = fromIsoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  switch (recurrence) {
    case 'DAILY':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'BIWEEKLY':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'MONTHLY':
      addMonths(date, 1);
      break;
    case 'QUARTERLY':
      addMonths(date, 3);
      break;
    case 'BIANNUAL':
      addMonths(date, 6);
      break;
    case 'ANNUAL':
      addMonths(date, 12);
      break;
  }
  return date.toISOString().slice(0, 10);
};

export const toIsoDate = (value: Date = new Date()): string =>
  value.toISOString().slice(0, 10);
