import { backoffDelayMs, MAX_ATTEMPTS } from './outbox-backoff';

describe('backoffDelayMs', () => {
  it.each([
    [1, 60_000],
    [2, 5 * 60_000],
    [3, 30 * 60_000],
    [4, 6 * 60 * 60_000],
  ])('attempt count %d backs off %dms', (attempts, expectedMs) => {
    expect(backoffDelayMs(attempts)).toBe(expectedMs);
  });

  it('clamps below 1 to the 1st attempt delay (defensive — attempts is never 0 in practice)', () => {
    expect(backoffDelayMs(0)).toBe(60_000);
  });

  it('clamps beyond the table to the last defined delay', () => {
    expect(backoffDelayMs(99)).toBe(6 * 60 * 60_000);
  });
});

describe('MAX_ATTEMPTS', () => {
  it('is 4 — the dispatcher marks FAILED at this attempt count instead of scheduling another retry', () => {
    expect(MAX_ATTEMPTS).toBe(4);
  });
});
