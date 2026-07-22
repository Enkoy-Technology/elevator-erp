ALTER TABLE crews ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE crews FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON crews
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON crews
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON crews TO app_user;--> statement-breakpoint

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE crew_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON crew_members
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON crew_members
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_members TO app_user;--> statement-breakpoint

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_phases FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON project_phases
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON project_phases
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON project_phases TO app_user;
