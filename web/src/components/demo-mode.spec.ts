import { isDemoMode } from './demo-mode';

describe('isDemoMode', () => {
  it('is on only for the exact string "1"', () => {
    expect(isDemoMode('1')).toBe(true);
  });

  // The failure that matters: a loosened truthiness check would light the
  // banner up on 'false' — and, worse, leave it dark on nothing at all.
  it.each(['0', 'false', 'true', '', ' 1', undefined])(
    'is off for %p',
    (value) => {
      expect(isDemoMode(value)).toBe(false);
    },
  );
});
