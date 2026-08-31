import { DomainError } from './domain.error';

/** Last 4 characters visible, the rest masked — same shape as
 * NoopSmsProvider's own maskRecipient (2nd occurrence in this codebase; per
 * this codebase's own "2nd occurrence, duplicate; 3rd+, extract"
 * convention, not yet worth a shared helper). This one masks whatever raw
 * string a human typed (may still contain spaces/dashes), not an already-
 * normalised E.164 recipient — same idea, applied at the input boundary. */
const maskPhone = (raw: string): string =>
  raw.length > 4 ? `${'*'.repeat(raw.length - 4)}${raw.slice(-4)}` : '****';

/**
 * Raised by common/phone.ts's normaliser at the enqueue boundary, not at
 * send time — a bad phone number on a queued reminder must fail loudly right
 * where a human (the person entering the number) can still fix it, not
 * silently retry forever inside the dispatcher. The message masks the raw
 * input (phase-5 review I4) — this error gets logged (see
 * MaintenanceReminderService/PaymentReminderService's own enqueue-failure
 * log lines), and a full phone number has no business sitting in a log,
 * same reasoning as NoopSmsProvider.maskRecipient two files away.
 */
export class InvalidPhoneNumberError extends DomainError {
  readonly status = 400;
  readonly problemType = 'invalid-phone-number';
  readonly title = 'Invalid phone number';

  constructor(raw: string) {
    super(`"${maskPhone(raw)}" is not a recognisable Ethiopian phone number`);
  }
}
