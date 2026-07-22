ALTER TABLE customer_fingerprints ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_fingerprints FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON customer_fingerprints
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON customer_fingerprints
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_fingerprints TO app_user;
