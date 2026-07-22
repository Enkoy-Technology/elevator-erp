import type { MaintenanceRecurrence } from './dto/maintenance.dto';

/** Advance a YYYY-MM-DD service date by the contract recurrence. */
export const advanceServiceDate = (
  fromIsoDate: string,
  recurrence: MaintenanceRecurrence,
): string => {
  const [year, month, day] = fromIsoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
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
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'QUARTERLY':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'BIANNUAL':
      date.setUTCMonth(date.getUTCMonth() + 6);
      break;
    case 'ANNUAL':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    case 'CUSTOM':
      return fromIsoDate;
  }
  return date.toISOString().slice(0, 10);
};

export const toIsoDate = (value: Date = new Date()): string =>
  value.toISOString().slice(0, 10);
