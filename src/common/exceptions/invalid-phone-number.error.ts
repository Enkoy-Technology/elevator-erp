import { DomainError } from './domain.error';

/**
 * Raised by common/phone.ts's normaliser at the enqueue boundary, not at
 * send time — a bad phone number on a queued reminder must fail loudly right
 * where a human (the person entering the number) can still fix it, not
 * silently retry forever inside the dispatcher.
 */
export class InvalidPhoneNumberError extends DomainError {
  readonly status = 400;
  readonly problemType = 'invalid-phone-number';
  readonly title = 'Invalid phone number';

  constructor(raw: string) {
    super(`"${raw}" is not a recognisable Ethiopian phone number`);
  }
}
