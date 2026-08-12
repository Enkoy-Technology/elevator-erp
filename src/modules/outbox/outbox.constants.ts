export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

// The dispatcher's own least-privilege connection (outbox_dispatcher role,
// migration 0049) — see OutboxDispatcherRepository's doc comment for why it
// exists and why it is scoped to only that class.
export const OUTBOX_DISPATCHER_POOL = Symbol('OUTBOX_DISPATCHER_POOL');
export const OUTBOX_DISPATCHER_DB = Symbol('OUTBOX_DISPATCHER_DB');
