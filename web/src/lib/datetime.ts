/**
 * Relative timestamps for list tables.
 *
 * A column full of "2026-08-31 14:07:22" is unreadable at a glance — you have
 * to do arithmetic to answer the only question anyone asks of it, which is
 * "is this recent?". So the cell says "3 days ago" and carries the exact
 * value in a `title` for the one time in fifty someone needs it.
 *
 * These are safe to call during render ONLY in client components whose rows
 * arrive after mount — which is every list in this app. A relative time
 * depends on `Date.now()`, so server-rendering one and then hydrating it a
 * second later produces a React hydration mismatch.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Beyond this, an absolute date is more use than "43 days ago". */
const RELATIVE_LIMIT = 30 * DAY;

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * "just now" · "8 min ago" · "3 h ago" · "5 days ago" · "12 Aug 2026".
 *
 * Deliberately not a library: this is the whole of what the tables need, and
 * the month names are fixed English rather than locale-derived so the same
 * string renders everywhere (see the hydration note above).
 */
export const formatRelative = (iso: string | null | undefined): string => {
  const date = parse(iso);
  if (!date) {
    return '—';
  }
  const elapsed = Date.now() - date.getTime();

  // A clock skew between the browser and the server can put a timestamp a few
  // seconds into the future; "in 4 seconds" would read as a bug.
  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    const mins = Math.floor(elapsed / MINUTE);
    return `${mins} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} h ago`;
  }
  if (elapsed < RELATIVE_LIMIT) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return formatDate(iso);
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "12 Aug 2026". Fixed English so server and client always agree. */
export const formatDate = (iso: string | null | undefined): string => {
  const date = parse(iso);
  if (!date) {
    return '—';
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** "12 Aug 2026, 14:07" — the exact value, for a `title` tooltip. */
export const formatDateTime = (iso: string | null | undefined): string => {
  const date = parse(iso);
  if (!date) {
    return '';
  }
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)}, ${hh}:${mm}`;
};
