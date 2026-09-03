import { formatDate, formatDateTime, formatRelative } from './datetime';

/** Frozen so "N days ago" is arithmetic, not a race with the wall clock. */
const NOW = new Date('2026-09-03T12:00:00.000Z').getTime();

const ago = (ms: number): string => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelative', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads as "just now" under a minute', () => {
    expect(formatRelative(ago(30_000))).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(formatRelative(ago(8 * MINUTE))).toBe('8 min ago');
    expect(formatRelative(ago(3 * HOUR))).toBe('3 h ago');
    expect(formatRelative(ago(5 * DAY))).toBe('5 days ago');
  });

  it('says yesterday rather than "1 days ago"', () => {
    expect(formatRelative(ago(DAY + HOUR))).toBe('yesterday');
  });

  it('falls back to a date once "N days ago" stops being useful', () => {
    // 45 days back from 2026-09-03 is 2026-07-20.
    expect(formatRelative(ago(45 * DAY))).toBe('20 Jul 2026');
  });

  it('does not render a future timestamp as negative', () => {
    // Browser/server clock skew puts timestamps slightly ahead; "in -4 min"
    // or "-1 days ago" would read as a bug in the data.
    expect(formatRelative(new Date(NOW + 4 * MINUTE).toISOString())).toBe(
      'just now',
    );
  });

  it('renders an em dash for missing or unparseable values', () => {
    expect(formatRelative(null)).toBe('—');
    expect(formatRelative(undefined)).toBe('—');
    expect(formatRelative('not-a-date')).toBe('—');
  });
});

describe('formatDate / formatDateTime', () => {
  it('formats in fixed English so the server and client agree', () => {
    expect(formatDate('2026-08-12T09:05:00.000Z')).toMatch(/^12 Aug 2026$/);
  });

  it('appends a zero-padded time', () => {
    const stamp = formatDateTime('2026-08-12T09:05:00.000Z');
    expect(stamp).toContain('12 Aug 2026, ');
    expect(stamp).toMatch(/\d{2}:\d{2}$/);
  });

  it('returns an empty title rather than "—" for a missing value', () => {
    // It feeds a `title` attribute; an em dash tooltip on an em dash cell is
    // noise.
    expect(formatDateTime(null)).toBe('');
  });
});
