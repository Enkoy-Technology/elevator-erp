import { DomainError } from './domain.error';

/**
 * Thrown by OutboxService.enqueue ITSELF (phase-5 review I3) when an SMS is
 * enqueued with no consentAt — the choke point refuses, rather than trusting
 * every caller to have already run canSmsRecipient. Before this, consent was
 * only ever checked by whoever remembered to call the shared predicate
 * (common/sms-consent.ts) before enqueuing; a shared predicate gives
 * consistent wording, not consistent enforcement, so a future reminder rule
 * could still forget the check entirely. Never carries the recipient in its
 * message — see InvalidPhoneNumberError's own doc comment for why a raw
 * phone number must not end up in a log line.
 */
export class SmsConsentRequiredError extends DomainError {
  readonly status = 422;
  readonly problemType = 'sms-consent-required';
  readonly title = 'SMS consent required';

  constructor() {
    super('Cannot send SMS: no consent on file for this recipient');
  }
}
