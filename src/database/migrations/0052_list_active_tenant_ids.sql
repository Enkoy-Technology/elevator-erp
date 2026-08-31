-- Reminder/reconciliation crons (task-2 brief §2.2/2.3/2.5) run off @Cron,
-- not a request, so — same as login (see resolve_tenant_by_slug below) —
-- there is no authenticated tenant to loop over yet. Unlike the outbox
-- dispatcher (0049_outbox_dispatcher_role.sql), these crons do their actual
-- per-tenant work through the normal TenantDbService.withTenant path (one
-- tenant, fully RLS-scoped, per iteration) — the ONLY thing that needs to
-- see across tenants is discovering which tenant ids exist in the first
-- place. That is a materially smaller need than the dispatcher's cross-tenant
-- claim query (which reads/writes business rows for every tenant in one
-- statement), so it gets the smaller tool already established in this
-- codebase for "read tenants before a tenant context exists" —
-- resolve_tenant_by_slug's own SECURITY DEFINER shape — rather than standing
-- up a second dedicated role/connection pool for a single-column read.
CREATE OR REPLACE FUNCTION list_active_tenant_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM tenants t
  WHERE t.deleted_at IS NULL;
$$;
