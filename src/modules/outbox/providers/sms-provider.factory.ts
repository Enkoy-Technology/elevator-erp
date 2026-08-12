import type { Env } from '../../../config';
import { AfroMessageProvider } from './afromessage.provider';
import { GeezSmsProvider } from './geezsms.provider';
import { NoopSmsProvider } from './noop-sms.provider';
import type { SmsProvider } from './sms-provider.interface';

/** The env fields SMS_PROVIDER selection actually reads — pulled out of `Env` so this is unit-testable without a real ConfigService. */
export type SmsProviderEnv = Pick<
  Env,
  'SMS_PROVIDER' | 'AFROMESSAGE_API_KEY' | 'AFROMESSAGE_SENDER' | 'GEEZSMS_TOKEN' | 'GEEZSMS_SENDER_ID'
>;

/**
 * Extracted out of OutboxModule's `useFactory` purely so the selection logic
 * (and its "fail loudly without credentials" branch) is unit-testable
 * without standing up Nest DI or mocking ConfigService — see this module's
 * own spec. The env schema's `superRefine` (src/config/env.schema.ts)
 * already fails `ConfigModule.forRoot` at boot in this same situation; the
 * throws here are defense in depth, not the primary guard.
 */
export const createSmsProvider = (env: SmsProviderEnv): SmsProvider => {
  switch (env.SMS_PROVIDER) {
    case 'afromessage': {
      if (!env.AFROMESSAGE_API_KEY) {
        throw new Error(
          'AFROMESSAGE_API_KEY must be set when SMS_PROVIDER=afromessage',
        );
      }
      return new AfroMessageProvider(env.AFROMESSAGE_API_KEY, env.AFROMESSAGE_SENDER);
    }
    case 'geezsms': {
      if (!env.GEEZSMS_TOKEN) {
        throw new Error('GEEZSMS_TOKEN must be set when SMS_PROVIDER=geezsms');
      }
      return new GeezSmsProvider(env.GEEZSMS_TOKEN, env.GEEZSMS_SENDER_ID);
    }
    case 'noop':
    default:
      return new NoopSmsProvider();
  }
};
