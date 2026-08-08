import { assertSeedAllowed } from './seed';

describe('assertSeedAllowed', () => {
  it('throws in production without the override', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production' }),
    ).toThrow('Refusing to seed demo data');
  });

  it('passes in production with ALLOW_DEMO_SEED=1', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEMO_SEED: '1',
      }),
    ).not.toThrow();
  });

  it('throws outside production without the override — an operator shell with no NODE_ENV set must not sail through', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'development' }),
    ).toThrow('Refusing to seed demo data');
    expect(() => assertSeedAllowed({})).toThrow('Refusing to seed demo data');
  });

  it('passes outside production with ALLOW_DEMO_SEED=1', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'development',
        ALLOW_DEMO_SEED: '1',
      }),
    ).not.toThrow();
  });
});
