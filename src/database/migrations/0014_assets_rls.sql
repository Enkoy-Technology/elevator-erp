-- RLS for assets (tenant-scoped).

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE assets FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON assets
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON assets TO app_user;
