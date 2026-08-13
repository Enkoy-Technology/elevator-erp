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

  // task-3 brief §3.0 SAFETY / I2: "Test all four branches" — env.schema.ts
  // owns the boot-time refusal branch; sms-allowlist.spec.ts owns the
  // runtime block/allow branches. Gated on SMS_LIVE, not NODE_ENV — see
  // env.schema.ts's own doc comment for why.
  describe('SMS_ALLOWLIST — the boot-time guard rail', () => {
    it('defaults to empty, and a noop provider needs no allowlist to boot in development', () => {
      const env = validateEnv(validEnv);
      expect(env.SMS_ALLOWLIST).toBe('');
    });

    it('refuses to boot with SMS_PROVIDER=afromessage, SMS_LIVE unset, and no SMS_ALLOWLIST', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          SMS_PROVIDER: 'afromessage',
          AFROMESSAGE_API_KEY: 'a-key',
        }),
      ).toThrow(/SMS_ALLOWLIST/);
    });

    it('refuses to boot with SMS_PROVIDER=geezsms, SMS_LIVE=0, and a whitespace-only SMS_ALLOWLIST', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          SMS_LIVE: '0',
          SMS_PROVIDER: 'geezsms',
          GEEZSMS_TOKEN: 'a-token',
          SMS_ALLOWLIST: '   ',
        }),
      ).toThrow(/SMS_ALLOWLIST/);
    });

    it('still refuses to boot with SMS_PROVIDER=afromessage, NODE_ENV=production, SMS_LIVE unset, and no SMS_ALLOWLIST — NODE_ENV alone must not bypass this', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          JWT_SECRET: 'a-sufficiently-long-secret-for-production-use',
          NODE_ENV: 'production',
          SMS_PROVIDER: 'afromessage',
          AFROMESSAGE_API_KEY: 'a-key',
        }),
      ).toThrow(/SMS_ALLOWLIST/);
    });

    it('boots fine with a real provider and SMS_LIVE unset once SMS_ALLOWLIST is set', () => {
      const env = validateEnv({
        ...validEnv,
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_API_KEY: 'a-key',
        SMS_ALLOWLIST: '+251949922604',
      });
      expect(env.SMS_ALLOWLIST).toBe('+251949922604');
    });

    it('does NOT require SMS_ALLOWLIST when SMS_LIVE=1 — the list is ignored there, not enforced', () => {
      const env = validateEnv({
        ...validEnv,
        SMS_LIVE: '1',
        SMS_PROVIDER: 'afromessage',
        AFROMESSAGE_API_KEY: 'a-key',
      });
      expect(env.SMS_ALLOWLIST).toBe('');
    });

    it('never requires SMS_ALLOWLIST for the default noop provider, regardless of SMS_LIVE', () => {
      expect(() => validateEnv({ ...validEnv, SMS_LIVE: '0' })).not.toThrow();
      expect(() => validateEnv({ ...validEnv, SMS_LIVE: '1' })).not.toThrow();
    });
  });

  describe('SMS_LIVE (I2) — the ONLY switch that lets outbound SMS reach real numbers', () => {
    it('defaults to false, independent of NODE_ENV', () => {
      expect(validateEnv(validEnv).SMS_LIVE).toBe(false);
      expect(validateEnv({ ...validEnv, NODE_ENV: 'production' as const, JWT_SECRET: 'a-sufficiently-long-secret-for-production-use' }).SMS_LIVE).toBe(false);
    });

    it('coerces "1" to true and "0" to false', () => {
      expect(validateEnv({ ...validEnv, SMS_LIVE: '1' }).SMS_LIVE).toBe(true);
      expect(validateEnv({ ...validEnv, SMS_LIVE: '0' }).SMS_LIVE).toBe(false);
    });

    it('rejects any value other than "0"/"1" — a typo like "true" must fail loudly, not silently default to off', () => {
      expect(() => validateEnv({ ...validEnv, SMS_LIVE: 'true' })).toThrow(/SMS_LIVE/);
    });
  });
});
