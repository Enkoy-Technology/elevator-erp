-- RLS for outbound_messages, mirroring 0035_natural_paladin.sql's corrected
-- pattern (REVOKE what app_user should not have) rather than 0033's original
-- GRANT — migration 0001's `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user` already hands every
-- new table all four privileges the moment it is created, so a `GRANT
-- SELECT, INSERT, UPDATE` statement here would be a silent no-op that still
-- leaves DELETE in place (caught the hard way in 0038, after 0033 shipped
-- that exact bug). Only an explicit REVOKE actually removes a privilege.
--
-- outbound_messages needs UPDATE (status transitions QUEUED -> SENDING ->
-- SENT|QUEUED|FAILED) but never DELETE: a message is either still pending,
-- delivered, or terminally failed — it is never removed, so the message log
-- stays a complete record of what was sent or attempted.
ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbound_messages FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON outbound_messages
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON outbound_messages
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

REVOKE DELETE ON outbound_messages FROM app_user;--> statement-breakpoint

-- Matches the dispatcher's claim query (OutboxDispatcherRepository.claimDue):
-- WHERE status = 'QUEUED' AND next_attempt_at <= now() ORDER BY
-- next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED. Partial so the index
-- stays tiny — only ever a handful of QUEUED rows at once — and Postgres
-- maintains membership automatically as a row's status changes. Deliberately
-- NOT tenant-scoped: the dispatcher runs as the admin role over every
-- tenant's due messages in one pass (see OutboxDispatcherRepository's own
-- doc comment for why that is safe).
CREATE INDEX IF NOT EXISTS outbound_messages_claim_idx
  ON outbound_messages (next_attempt_at)
  WHERE status = 'QUEUED';--> statement-breakpoint

-- Matches how the future message-log UI reads: every list page sorts by
-- created_at DESC within a tenant (same convention as
-- proformas_tenant_created_idx / payments_tenant_created_idx).
CREATE INDEX IF NOT EXISTS outbound_messages_tenant_created_idx
  ON outbound_messages (tenant_id, created_at DESC);
