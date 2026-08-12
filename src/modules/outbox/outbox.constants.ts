export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

// The allowlist guard rail's runtime config (NODE_ENV + parsed
// SMS_ALLOWLIST) — see sms-allowlist.ts and OutboxModule's factory for it.
export const SMS_ALLOWLIST_CONFIG = Symbol('SMS_ALLOWLIST_CONFIG');

// The dispatcher's own least-privilege connection (outbox_dispatcher role,
// migration 0049) — see OutboxDispatcherRepository's doc comment for why it
// exists and why it is scoped to only that class.
export const OUTBOX_DISPATCHER_POOL = Symbol('OUTBOX_DISPATCHER_POOL');
export const OUTBOX_DISPATCHER_DB = Symbol('OUTBOX_DISPATCHER_DB');
