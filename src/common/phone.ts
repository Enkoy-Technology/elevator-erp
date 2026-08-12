import { InvalidPhoneNumberError } from './exceptions';

/**
 * Normalises an Ethiopian mobile number to E.164 (`+251XXXXXXXXX`) at the
 * point of enqueue (OutboxService.enqueue), never at send time — see
 * InvalidPhoneNumberError's own doc comment for why.
 *
 * Accepts the forms staff actually type: `0911234567`, `+251911234567`,
 * `251911234567`, with spaces or dashes anywhere. The national number is 9
 * digits starting with `9` (Ethio Telecom / long-standing Safaricom range)
 * or `7` (Safaricom Ethiopia's newer range) — landlines and anything else
 * are rejected rather than guessed at, per the brief: a phone number this
 * function can't place is a data problem a human should fix now, not a
 * reminder that silently never arrives.
 */
const ETHIOPIAN_MOBILE_NATIONAL_RE = /^[79]\d{8}$/;

export function normalizeEthiopianPhone(raw: string): string {
  const stripped = raw.replace(/[\s-]/g, '');

  const national = stripped.startsWith('+251')
    ? stripped.slice(4)
    : stripped.startsWith('251')
      ? stripped.slice(3)
      : stripped.startsWith('0')
        ? stripped.slice(1)
        : stripped;

  if (!ETHIOPIAN_MOBILE_NATIONAL_RE.test(national)) {
    throw new InvalidPhoneNumberError(raw);
  }

  return `+251${national}`;
}
