import { assertSeedAllowed } from './seed';

describe('assertSeedAllowed', () => {
  it('throws in production without the override', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production' }),
    ).toThrow('Refusing to seed demo data in production');
  });

  it('passes in production with ALLOW_DEMO_SEED=1', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEMO_SEED: '1',
      }),
    ).not.toThrow();
  });

  it('passes outside production', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});
