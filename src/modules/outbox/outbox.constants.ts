export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

// The dispatcher's admin-role connection — see OutboxDispatcherRepository's
// doc comment for why it exists and why it is scoped to only that class.
export const OUTBOX_ADMIN_POOL = Symbol('OUTBOX_ADMIN_POOL');
export const OUTBOX_ADMIN_DB = Symbol('OUTBOX_ADMIN_DB');
