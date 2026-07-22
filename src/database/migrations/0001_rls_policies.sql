-- Custom migration: RLS policies, tenant-context functions, and the
-- non-owner application role. See docs/planning/FEATURE-phase0-foundation.md.

-- Transaction-local tenant context. NOTE: is_local = true (deliberate
-- deviation from TAD §2.3 which shows `false`): with pooled connections a
-- session-level GUC would leak tenant context between requests. All app
-- queries run inside a transaction opened by TenantDbService.
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid uuid)
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('app.tenant_id', tenant_uuid::text, true);
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;--> statement-breakpoint

-- Login-time tenant resolution runs before any tenant context exists, so it
-- must bypass RLS. SECURITY DEFINER: executes with the migration owner's
-- privileges. Exposes only id + subscription status of non-deleted tenants.
CREATE OR REPLACE FUNCTION resolve_tenant_by_slug(p_slug text)
RETURNS TABLE (id uuid, subscription_status subscription_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.subscription_status
  FROM tenants t
  WHERE t.slug = p_slug
    AND t.deleted_at IS NULL;
$$;--> statement-breakpoint

-- Non-owner application role: RLS only applies to roles that do not own the
-- tables (unless FORCE, below). Dev password; production roles are managed
-- by ops outside migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_password';
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;--> statement-breakpoint

-- Enable + FORCE RLS on every tenant-scoped table. FORCE subjects even the
-- table owner (superusers always bypass; that is what db:seed relies on).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tenant_branding FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- tenants: a tenant may only see its own row.
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON tenants
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

CREATE POLICY tenant_isolation ON tenant_branding
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON tenant_branding
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON users
  USING (current_setting('app.admin_bypass', true) = 'on');--> statement-breakpoint

CREATE POLICY tenant_isolation ON permissions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY admin_bypass ON permissions
  USING (current_setting('app.admin_bypass', true) = 'on');
