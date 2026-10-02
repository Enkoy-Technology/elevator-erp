/**
 * Service dates and "today" are business-calendar facts, not UTC ones. On a
 * UTC clock the app is a day behind between local midnight and 03:00 Addis
 * time.
 * ponytail: one company-wide zone; move to a per-tenant setting if the
 * product ever sells outside East Africa.
 */
export const BUSINESS_TIMEZONE = 'Africa/Addis_Ababa';

/** The given instant's calendar date in the business timezone. en-CA formats as ISO. */
export const todayIso = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** Whole calendar days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export const daysBetweenIso = (fromIso: string, toIso: string): number =>
  Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );

/**
 * Monday to Friday.
 * ponytail: public holidays count as working days; add a holiday calendar
 * (per tenant) if a count must match the contract to the day.
 */
const isWorkingDay = (d: Date): boolean =>
  d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** The date `days` working days after `fromIso` (ISO 'YYYY-MM-DD'); `fromIso` itself is day zero. */
export const addWorkingDaysIso = (fromIso: string, days: number): string => {
  const d = new Date(`${fromIso}T00:00:00Z`);
  for (let left = days; left > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) {
      left--;
    }
  }
  return d.toISOString().slice(0, 10);
};

/**
 * Working days from `fromIso` to `toIso`: positive while `toIso` is ahead,
 * 0 on the day, negative once it has passed — and never 0 then, so a
 * Friday deadline reads as overdue on the Saturday rather than "today".
 */
export const workingDaysBetweenIso = (fromIso: string, toIso: string): number => {
  if (toIso < fromIso) {
    return -Math.max(1, workingDaysBetweenIso(toIso, fromIso));
  }
  const d = new Date(`${fromIso}T00:00:00Z`);
  const end = Date.parse(`${toIso}T00:00:00Z`);
  let count = 0;
  while (d.getTime() < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) {
      count++;
    }
  }
  return count;
};
