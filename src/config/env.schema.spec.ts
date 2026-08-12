import { validateEnv } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://app_user:pw@localhost:5432/erp',
  JWT_SECRET: 'a-sufficiently-long-secret',
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv(validEnv);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.JWT_REFRESH_TTL_SECONDS).toBe(604800);
  });

  it('rejects a missing JWT_SECRET', () => {
    const { JWT_SECRET: _omitted, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('coerces numeric strings for PORT', () => {
    expect(validateEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('defaults SMS_PROVIDER to noop, needing no credentials', () => {
    expect(validateEnv(validEnv).SMS_PROVIDER).toBe('noop');
  });

  it('rejects SMS_PROVIDER=afromessage without AFROMESSAGE_API_KEY', () => {
    expect(() =>
      validateEnv({ ...validEnv, SMS_PROVIDER: 'afromessage' }),
    ).toThrow(/AFROMESSAGE_API_KEY/);
  });

  it('accepts SMS_PROVIDER=afromessage with AFROMESSAGE_API_KEY and SMS_ALLOWLIST set', () => {
    const env = validateEnv({
      ...validEnv,
      SMS_PROVIDER: 'afromessage',
      AFROMESSAGE_API_KEY: 'a-key',
      SMS_ALLOWLIST: '+251949922604',
    });
    expect(env.SMS_PROVIDER).toBe('afromessage');
  });

  it('rejects SMS_PROVIDER=geezsms without GEEZSMS_TOKEN', () => {
    expect(() => validateEnv({ ...validEnv, SMS_PROVIDER: 'geezsms' })).toThrow(
      /GEEZSMS_TOKEN/,
    );
  });

  it('accepts SMS_PROVIDER=geezsms with GEEZSMS_TOKEN and SMS_ALLOWLIST set', () => {
    const env = validateEnv({
      ...validEnv,
      SMS_PROVIDER: 'geezsms',
      GEEZSMS_TOKEN: 'a-token',
      SMS_ALLOWLIST: '+251949922604',
    });
    expect(env.SMS_PROVIDER).toBe('geezsms');
  });

  it('rejects an unknown SMS_PROVIDER value', () => {
    expect(() => validateEnv({ ...validEnv, SMS_PROVIDER: 'twilio' })).toThrow(
      /SMS_PROVIDER/,
    );
  });

  // task-3 brief §3.0 SAFETY: "Test all four branches" — env.schema.ts owns
  // the boot-time refusal branch; sms-allowlist.spec.ts owns the runtime
  // block/allow branches.
  describe('SMS_ALLOWLIST — the boot-time guard rail', () => {
    it('defaults to empty, and a noop provider needs no allowlist to boot in development', () => {
      const env = validateEnv(validEnv);
      expect(env.SMS_ALLOWLIST).toBe('');
    });

    it('refuses to boot with SMS_PROVIDER=afromessage, NODE_ENV!=production, and no SMS_ALLOWLIST', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          SMS_PROVIDER: 'afromessage',
          AFROMESSAGE_API_KEY: 'a-key',
        }),
      ).toThrow(/SMS_ALLOWLIST/);
    });

    it('refuses to boot with SMS_PROVIDER=geezsms, NODE_ENV=development, and a whitespace-only SMS_ALLOWLIST', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          NODE_ENV: 'development',
          SMS_PROVIDER: 'geezsms',
          GEEZSMS_TOKEN: 'a-token',
          SMS_ALLOWLIST: '   ',
        }),
      ).toThrow(/SMS_ALLOWLIST/);
    });

    it('boots fine with a real provider outside production once SMS_ALLOWLIST is set', () => {
      const env = validateEnv({
        ...validEnv,
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_API_KEY: 'a-key',
        SMS_ALLOWLIST: '+251949922604',
      });
      expect(env.SMS_ALLOWLIST).toBe('+251949922604');
    });

    it('does NOT require SMS_ALLOWLIST in production — the list is ignored there, not enforced', () => {
      const env = validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a-sufficiently-long-secret-for-production-use',
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_API_KEY: 'a-key',
      });
      expect(env.SMS_ALLOWLIST).toBe('');
    });

    it('never requires SMS_ALLOWLIST for the default noop provider, in any non-production NODE_ENV', () => {
      expect(() => validateEnv({ ...validEnv, NODE_ENV: 'test' })).not.toThrow();
      expect(() => validateEnv({ ...validEnv, NODE_ENV: 'development' })).not.toThrow();
    });
  });
});
