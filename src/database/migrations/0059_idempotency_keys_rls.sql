-- RLS for idempotency_keys, same pattern as 0048_outbound_messages_rls.sql
-- (REVOKE what app_user should not have, not GRANT — migration 0001's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
-- DELETE ON TABLES TO app_user` already hands every new table all four
-- privileges the moment it is created, so a GRANT statement here would be a
-- silent no-op; only an explicit REVOKE actually removes a privilege).
--
-- Unlike the money ledgers this table sits in front of (payments, invoices,
-- expenses, bank_transactions — all REVOKE UPDATE, DELETE, append-only by
-- design), idempotency_keys is deliberately NOT append-only: a row is
-- claimed with an INSERT (IdempotencyKeysRepository.claim) and then filled
-- in with an UPDATE once the guarded handler completes
-- (IdempotencyKeysRepository.complete) — and the SAME claim path also
-- reclaims a stale, never-completed row with an UPDATE (the claimant's
-- process died mid-handler; this client's site loses power ~39 times a
-- month, so that is not hypothetical). UPDATE stays granted. Only DELETE is
-- revoked: the app never removes a row here (pruning old claims, if this
-- table's growth ever needs it, is an ops job via the admin/owner role, not
-- app_user).
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON idempotency_keys
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON idempotency_keys
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

REVOKE DELETE ON idempotency_keys FROM app_user;
