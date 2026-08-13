import type { Logger } from '@nestjs/common';

/**
 * The one gate every reminder rule must pass before enqueuing an SMS (task-2
 * brief §2.1, ECA Directive 832/2021: A2P senders need recorded consent — see
 * `customers.smsConsentAt`/`users.smsConsentAt`'s own doc comments for the
 * full citation). A single shared predicate, not one copy per rule, so a
 * future rule can never forget the check — every caller imports this instead
 * of re-deriving "is smsConsentAt set".
 */
export interface SmsConsentRecipient {
  smsConsentAt: Date | null;
  /**
   * When consent was revoked (phase-5 review I10) — null means either never
   * revoked, or never consented at all. A revoke no longer nulls
   * smsConsentAt (see customers.ts/users.ts's own doc comments on this
   * column), so entitlement is smsConsentAt set AND not (yet) revoked.
   */
  smsConsentRevokedAt: Date | null;
}

export function canSmsRecipient(recipient: SmsConsentRecipient): boolean {
  // != null (not !==) so an accidentally-`undefined` field fails closed
  // instead of silently passing the gate (phase-5 review I3) — `null` and
  // `undefined` are both "no answer", and only a real Date should pass.
  return (
    recipient.smsConsentAt != null && recipient.smsConsentRevokedAt == null
  );
}

/**
 * A consent skip must be visible, not silent (task-2 brief §2.1) — one log
 * line per skipped recipient. Callers additionally keep their own running
 * count for the cron's end-of-run summary; this only standardises the line
 * itself so every rule's skip reads the same way in the logs.
 */
export function logSmsConsentSkip(
  logger: Pick<Logger, 'warn'>,
  ctx: { tenantId: string; recipientKind: string; recipientId: string },
): void {
  logger.warn(
    `Skipped SMS to ${ctx.recipientKind} ${ctx.recipientId} (tenant ${ctx.tenantId}): no smsConsentAt on file`,
  );
}
