import { normalizeEthiopianPhone } from '../../common/phone';

/**
 * The allowlist guard rail (task-3 brief §3.0 SAFETY) — structural, not a
 * promise: outside production this is the one place that decides whether
 * `OutboxDispatcherService` is allowed to actually hand a recipient to the
 * configured `SmsProvider`. Pure and DB/DI-free so every branch the brief
 * calls out is unit-testable without Nest or Postgres; wired into the
 * dispatcher via `SMS_ALLOWLIST_CONFIG` (see `outbox.module.ts`) and into
 * boot-time refusal via `env.schema.ts`'s `superRefine`.
 */

/**
 * `SMS_ALLOWLIST` is a raw comma-separated env string — parsed once here,
 * not scattered as ad hoc `.split(',')` calls at each call site. Each entry
 * is normalised to E.164 the same way `OutboxService.enqueue` normalises
 * every recipient before it ever reaches `outbound_messages.recipient`
 * (phase-5 review nit): `smsAllowlistBlockReason` below compares raw,
 * un-normalised strings, so an operator typing `SMS_ALLOWLIST=0949922604`
 * (the form they'd naturally type) used to compare against `+251949922604`
 * and block every real recipient while the boot log claimed the allowlist
 * was enforcing. A malformed entry throws at boot (same
 * "fail loudly, at the point a human can fix it" as
 * `InvalidPhoneNumberError`) rather than silently sitting in the list,
 * unable to ever match anything.
 */
export const parseSmsAllowlist = (raw: string): readonly string[] =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizeEthiopianPhone(entry));

export interface SmsAllowlistRuntimeConfig {
  readonly smsLive: boolean;
  readonly allowlist: readonly string[];
}

/**
 * Returns a human-readable, credential-free reason `recipient` must NOT be
 * sent to right now, or `null` if sending may proceed. The dispatcher writes
 * this string straight into `outbound_messages.last_error` on a blocked
 * message (task-3 brief: "a blocked message must be VISIBLE... never
 * silently dropped") — it must never contain anything but the recipient and
 * config shape, never a message body or credential.
 *
 * The four branches, all unit-tested in this file's own spec. Gated on
 * SMS_LIVE (I2), never on NODE_ENV: an idiomatic Dockerfile sets
 * NODE_ENV=production for any built Node app, staging included, so tying
 * this to NODE_ENV would silently disable the guard rail the moment such a
 * container exists. SMS_LIVE is the one flag an operator must set
 * deliberately to let a box reach real numbers.
 *  1. `smsLive === true` -> never blocked. Real customers must receive real
 *     reminders; the allowlist has no effect once live.
 *  2. not live, empty allowlist -> never blocked. Only reachable with
 *     `SMS_PROVIDER=noop` in practice — a real provider selected with an
 *     empty allowlist while not live already refuses to boot (see
 *     `env.schema.ts`'s `superRefine`), so this branch exists for
 *     completeness and for the noop-with-no-allowlist dev default.
 *  3. not live, non-empty allowlist, recipient listed -> not blocked.
 *  4. not live, non-empty allowlist, recipient NOT listed -> blocked.
 */
export const smsAllowlistBlockReason = (
  smsLive: boolean,
  allowlist: readonly string[],
  recipient: string,
): string | null => {
  if (smsLive) {
    return null;
  }
  if (allowlist.length === 0) {
    return null;
  }
  if (allowlist.includes(recipient)) {
    return null;
  }
  return (
    `Blocked by SMS_ALLOWLIST: ${recipient} is not one of the ${allowlist.length} ` +
    'number(s) allowed to receive SMS while SMS_LIVE is not "1". ' +
    'Add it to SMS_ALLOWLIST, or set SMS_LIVE=1 to reach real numbers (production only).'
  );
};
