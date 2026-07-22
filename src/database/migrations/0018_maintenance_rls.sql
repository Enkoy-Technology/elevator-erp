-- RLS for maintenance tables (tenant-scoped).

ALTER TABLE maintenance_contracts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE maintenance_contracts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON maintenance_contracts
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON maintenance_contracts
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_contracts TO app_user;--> statement-breakpoint

ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE service_visits FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON service_visits
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON service_visits
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON service_visits TO app_user;--> statement-breakpoint

ALTER TABLE breakdowns ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE breakdowns FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON breakdowns
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON breakdowns
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON breakdowns TO app_user;
