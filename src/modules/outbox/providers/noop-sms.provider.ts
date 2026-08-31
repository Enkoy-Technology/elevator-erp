import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type { SmsProvider } from './sms-provider.interface';

/** Recipient, masked to its last 4 digits — never log a full phone number. */
const maskRecipient = (to: string): string =>
  to.length > 4 ? `${'*'.repeat(to.length - 4)}${to.slice(-4)}` : '****';

/**
 * Selected when no real SMS provider is configured (SMS_PROVIDER unset or
 * 'noop') — logs and returns a synthetic id, so dev and CI exercise the
 * whole outbox pipeline with zero credentials. `providerName: 'noop'` is
 * recorded on the message row itself, which is what actually makes it
 * obvious in the (future) message log that nothing really sent — this
 * provider deliberately never logs the recipient or body verbatim (PII).
 */
@Injectable()
export class NoopSmsProvider implements SmsProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopSmsProvider.name);

  async send(to: string, body: string): Promise<{ providerMessageId: string }> {
    this.logger.log(
      `[noop] not really sending SMS to ${maskRecipient(to)} (${body.length} chars)`,
    );
    return Promise.resolve({ providerMessageId: `noop-${randomUUID()}` });
  }
}
