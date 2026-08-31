import { parseBootstrapEnv } from './bootstrap-tenant.cli';

const valid = {
  TENANT_SLUG: 'shining-star',
  TENANT_NAME: 'Shining Star Electromechanical Works',
  ADMIN_EMAIL: 'Admin@Example.com',
  ADMIN_PASSWORD: 'a-long-enough-password',
};

describe('parseBootstrapEnv', () => {
  it('accepts a complete environment and normalizes slug and email', () => {
    const parsed = parseBootstrapEnv({ ...valid, TENANT_SLUG: 'Shining-Star' });
    expect(parsed.slug).toBe('shining-star');
    expect(parsed.email).toBe('admin@example.com');
    expect(parsed.fullName).toBe('Administrator');
    expect(parsed.legalName).toBe('Shining Star Electromechanical Works');
  });

  it.each(['TENANT_SLUG', 'TENANT_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'])(
    'names %s when it is missing',
    (key) => {
      expect(() => parseBootstrapEnv({ ...valid, [key]: '' })).toThrow(key);
    },
  );

  // The slug is what POST /auth/login takes as tenantSlug, so a bad one
  // locks the tenant out of its own login after the row already exists.
  it.each(['-leading', 'trailing-', 'has space', 'UPPER_SCORE', ''])(
    'rejects the malformed slug %p',
    (slug) => {
      expect(() => parseBootstrapEnv({ ...valid, TENANT_SLUG: slug })).toThrow();
    },
  );

  // This account can reset every other password.
  it('rejects a short password', () => {
    expect(() => parseBootstrapEnv({ ...valid, ADMIN_PASSWORD: 'short' })).toThrow(
      /at least 12 characters/,
    );
  });

  it('rejects an address that is not an email', () => {
    expect(() => parseBootstrapEnv({ ...valid, ADMIN_EMAIL: 'not-an-email' })).toThrow(
      /must be an email/,
    );
  });
});
