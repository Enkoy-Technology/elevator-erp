-- RLS for contracts and contract_instalments, same pattern as
-- 0059_idempotency_keys_rls.sql: REVOKE what app_user should not have
-- rather than GRANT what it should. Migration 0001's `ALTER DEFAULT
-- PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON
-- TABLES TO app_user` already hands every new table all four privileges the
-- moment it is created, so a GRANT here is a silent no-op — a mistake this
-- project has made three times.
--
-- `contracts` is APPEND-ONLY on the parts the customer holds a copy of, but
-- not wholly immutable: the record legitimately moves DRAFT -> SIGNED ->
-- COMPLETED, and signing, handover and cancellation each write to it after
-- issue. So UPDATE stays granted and the immutability that matters —
-- number, value, parties — is enforced in the repository rather than by
-- revoking UPDATE outright. DELETE is revoked: a contract the customer has
-- seen is cancelled, never erased.
--
-- `contract_instalments` is the payment schedule. It is edited while the
-- schedule is being agreed and then marked INVOICED as invoices are raised,
-- so it needs UPDATE too. DELETE is revoked for the same reason — an
-- instalment that is no longer wanted is CANCELLED, so the agreed schedule
-- and what actually happened to it both stay legible.
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON contracts
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON contracts
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

REVOKE DELETE ON contracts FROM app_user;--> statement-breakpoint

ALTER TABLE contract_instalments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE contract_instalments FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON contract_instalments
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON contract_instalments
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

REVOKE DELETE ON contract_instalments FROM app_user;
