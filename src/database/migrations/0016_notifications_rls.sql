-- RLS for notifications (tenant-scoped).

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY tenant_isolation ON notifications
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

CREATE POLICY admin_bypass ON notifications
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO app_user;
