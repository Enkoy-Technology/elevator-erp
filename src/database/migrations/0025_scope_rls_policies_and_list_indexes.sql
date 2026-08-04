-- Both RLS policies were PERMISSIVE and applied to PUBLIC, so PostgreSQL OR'd
-- them together for every role:
--   tenant_id = current_tenant_id() OR current_setting('app.admin_bypass') = 'on'
-- An OR against a session setting cannot drive an index, so every tenant query
-- degraded to a full scan of the table across ALL tenants. Measured on 120k
-- customers: 39.5ms seq scan vs 0.12ms index scan once the OR is gone.
--
-- Scoping each policy to the role that needs it leaves app_user with a single
-- indexable equality, and keeps the bypass available to the table owner for
-- migrations/backfills. Superusers bypass RLS regardless, which is what
-- db:seed relies on. Any other role now matches no permissive policy and sees
-- nothing — fail-closed, which is the safe direction.
DO $$
DECLARE
  t text;
  owner_role text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'tenant_branding', 'users', 'customers', 'projects',
    'assets', 'notifications', 'maintenance_contracts', 'service_visits',
    'breakdowns'
  ]
  LOOP
    EXECUTE format('ALTER POLICY tenant_isolation ON %I TO app_user', t);
    SELECT pg_get_userbyid(relowner) INTO owner_role
      FROM pg_class WHERE oid = format('public.%I', t)::regclass;
    EXECUTE format('ALTER POLICY admin_bypass ON %I TO %I', t, owner_role);
  END LOOP;
END
$$;--> statement-breakpoint

-- Indexes matching how the list endpoints actually read. These were useless
-- before the policy fix above (the planner could not reach them) and are the
-- payoff for it: every list page sorts by created_at DESC within a tenant.
CREATE INDEX IF NOT EXISTS customers_tenant_created_idx
  ON customers (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_tenant_created_idx
  ON projects (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_tenant_created_idx
  ON assets (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS breakdowns_tenant_created_idx
  ON breakdowns (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;--> statement-breakpoint

-- 0022 tried to create a partial breakdowns index but reused 0017's name, so
-- IF NOT EXISTS silently made it a no-op. Replace the unpartitioned original.
DROP INDEX IF EXISTS breakdowns_tenant_status_idx;--> statement-breakpoint
CREATE INDEX breakdowns_tenant_status_live_idx
  ON breakdowns (tenant_id, status)
  WHERE deleted_at IS NULL;--> statement-breakpoint

-- 0017 and 0022 both indexed maintenance_contracts (tenant_id, next_service_at);
-- the 0022 partial index covers every query, so drop the redundant original.
DROP INDEX IF EXISTS maintenance_contracts_tenant_next_idx;
