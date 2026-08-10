-- RLS for quotations (tenant-scoped). FORCE so the table owner is also
-- subject to RLS when not using admin_bypass; app connects as app_user.
--
-- Policies are scoped to the role that needs them from creation (mirroring
-- the fix in 0025_scope_rls_policies_and_list_indexes.sql): a PERMISSIVE
-- policy applied to PUBLIC gets OR'd with every other PERMISSIVE policy on
-- the table for every role, which defeats index usage. tenant_isolation is
-- scoped to app_user (the only role the app connects as); admin_bypass is
-- scoped to the table owner (postgres via DATABASE_ADMIN_URL) for
-- migrations/backfills. Superusers bypass RLS regardless, which is what
-- db:seed relies on.
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotations FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON quotations
  TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON quotations
  TO postgres
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON quotations TO app_user;--> statement-breakpoint

-- Matches how the list endpoint reads: every list page sorts by
-- created_at DESC within a tenant (see 0025's index rationale).
CREATE INDEX IF NOT EXISTS quotations_tenant_created_idx
  ON quotations (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
