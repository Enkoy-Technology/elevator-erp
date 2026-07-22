-- RLS for quotations (tenant-scoped). FORCE so table owner is also subject to
-- RLS when not using admin_bypass; app connects as app_user.

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE quotations FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON quotations
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON quotations
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON quotations TO app_user;
