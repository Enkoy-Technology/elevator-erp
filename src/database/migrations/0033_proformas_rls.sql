-- RLS for proformas and document_sequences (both tenant-scoped), mirroring
-- 0031_quotations_rls.sql: policies are scoped to the role that needs them
-- from creation (tenant_isolation -> app_user, admin_bypass -> the table
-- owner), never applied to PUBLIC — an unscoped PERMISSIVE policy gets OR'd
-- with every other PERMISSIVE policy on the table for every role, which
-- defeats index usage (see 0025's measured 39.5ms seq scan vs 0.12ms index
-- scan). FORCE so the table owner is also subject to RLS when not using
-- admin_bypass; app connects as app_user. Superusers bypass RLS regardless,
-- which is what db:seed relies on.
ALTER TABLE proformas ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE proformas FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON proformas
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON proformas
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

-- No DELETE: proformas is an append-only book (see the schema's own doc
-- comment on proformaStatusEnum) — cancel is a status + reason column, never
-- a row removal. Mirrors 0028_revoke_delete_rate_versions.sql's reasoning
-- for the other immutable-ledger table in this schema.
GRANT SELECT, INSERT, UPDATE ON proformas TO app_user;--> statement-breakpoint

-- Matches how the list endpoint reads: every list page sorts by
-- created_at DESC within a tenant.
CREATE INDEX IF NOT EXISTS proformas_tenant_created_idx
  ON proformas (tenant_id, created_at DESC);--> statement-breakpoint

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE document_sequences FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON document_sequences
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON document_sequences
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

-- No DELETE: sequence rows are only ever claimed upward (INSERT ... ON
-- CONFLICT DO UPDATE), never removed.
GRANT SELECT, INSERT, UPDATE ON document_sequences TO app_user;
