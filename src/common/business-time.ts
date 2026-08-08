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
