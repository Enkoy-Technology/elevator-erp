-- "Won this month" must key off the moment a project entered CONTRACT, not
-- statusChangedAt (which resets on every later transition and double-counts).
ALTER TABLE projects ADD COLUMN won_at timestamptz;--> statement-breakpoint

-- Backfill: for projects already at/past CONTRACT the best available signal
-- is when they entered their current stage. projects has FORCE RLS, so a
-- non-superuser migration role sees zero rows without the bypass GUC.
SELECT set_config('app.admin_bypass', 'on', false);--> statement-breakpoint
UPDATE projects
SET won_at = status_changed_at
WHERE status IN ('CONTRACT', 'EXECUTION', 'COMPLETED')
  AND won_at IS NULL;--> statement-breakpoint
SELECT set_config('app.admin_bypass', '', false);--> statement-breakpoint

-- Indexes for the dashboard and list hot paths (all filter by tenant via RLS,
-- so tenant_id leads every index).
CREATE INDEX IF NOT EXISTS projects_tenant_status_idx
  ON projects (tenant_id, status)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_tenant_won_at_idx
  ON projects (tenant_id, won_at)
  WHERE deleted_at IS NULL AND won_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS maintenance_contracts_tenant_next_service_idx
  ON maintenance_contracts (tenant_id, next_service_at)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS breakdowns_tenant_status_idx
  ON breakdowns (tenant_id, status)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_visits_tenant_contract_idx
  ON service_visits (tenant_id, contract_id, visited_at DESC);
