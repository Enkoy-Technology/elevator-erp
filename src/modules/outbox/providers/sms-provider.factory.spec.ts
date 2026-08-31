import { AfroMessageProvider } from './afromessage.provider';
import { GeezSmsProvider } from './geezsms.provider';
import { NoopSmsProvider } from './noop-sms.provider';
import { createSmsProvider, type SmsProviderEnv } from './sms-provider.factory';

const baseEnv: SmsProviderEnv = {
  SMS_PROVIDER: 'noop',
  AFROMESSAGE_API_KEY: undefined,
  AFROMESSAGE_SENDER: undefined,
  GEEZSMS_TOKEN: undefined,
  GEEZSMS_SENDER_ID: undefined,
};

describe('createSmsProvider', () => {
  it('defaults to NoopSmsProvider', () => {
    expect(createSmsProvider(baseEnv)).toBeInstanceOf(NoopSmsProvider);
  });

  it('picks AfroMessageProvider when SMS_PROVIDER=afromessage and a key is set', () => {
    const provider = createSmsProvider({
      ...baseEnv,
      SMS_PROVIDER: 'afromessage',
      AFROMESSAGE_API_KEY: 'a-key',
    });
    expect(provider).toBeInstanceOf(AfroMessageProvider);
    expect(provider.name).toBe('afromessage');
  });

  it('fails loudly when afromessage is selected without a key', () => {
    expect(() =>
      createSmsProvider({ ...baseEnv, SMS_PROVIDER: 'afromessage' }),
    ).toThrow(/AFROMESSAGE_API_KEY/);
  });

  it('picks GeezSmsProvider when SMS_PROVIDER=geezsms and a token is set', () => {
    const provider = createSmsProvider({
      ...baseEnv,
      SMS_PROVIDER: 'geezsms',
      GEEZSMS_TOKEN: 'a-token',
    });
    expect(provider).toBeInstanceOf(GeezSmsProvider);
    expect(provider.name).toBe('geezsms');
  });

  it('fails loudly when geezsms is selected without a token', () => {
    expect(() => createSmsProvider({ ...baseEnv, SMS_PROVIDER: 'geezsms' })).toThrow(
      /GEEZSMS_TOKEN/,
    );
  });
});
