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

  it('accepts SMS_PROVIDER=afromessage with AFROMESSAGE_API_KEY set', () => {
    const env = validateEnv({
      ...validEnv,
      SMS_PROVIDER: 'afromessage',
      AFROMESSAGE_API_KEY: 'a-key',
    });
    expect(env.SMS_PROVIDER).toBe('afromessage');
  });

  it('rejects SMS_PROVIDER=geezsms without GEEZSMS_TOKEN', () => {
    expect(() => validateEnv({ ...validEnv, SMS_PROVIDER: 'geezsms' })).toThrow(
      /GEEZSMS_TOKEN/,
    );
  });

  it('accepts SMS_PROVIDER=geezsms with GEEZSMS_TOKEN set', () => {
    const env = validateEnv({
      ...validEnv,
      SMS_PROVIDER: 'geezsms',
      GEEZSMS_TOKEN: 'a-token',
    });
    expect(env.SMS_PROVIDER).toBe('geezsms');
  });

  it('rejects an unknown SMS_PROVIDER value', () => {
    expect(() => validateEnv({ ...validEnv, SMS_PROVIDER: 'twilio' })).toThrow(
      /SMS_PROVIDER/,
    );
  });
});
