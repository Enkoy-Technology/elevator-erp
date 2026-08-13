-- I8 (phase-5 whole-branch review): list_active_tenant_ids() filtered only
-- on deleted_at IS NULL, so a SUSPENDED or CANCELLED tenant (see
-- tenants.subscription_status) kept running all three crons — including the
-- two SMS reminder crons — and kept spending SMS credit after the client
-- stopped paying. The function's own name asserts "active"; this migration
-- is what actually makes that true. Only replaces the function body — same
-- SECURITY DEFINER shape as 0052_list_active_tenant_ids.sql, see that
-- migration's own doc comment for why this mechanism (not the outbox
-- dispatcher's dedicated-role approach) is the right-sized tool here.
CREATE OR REPLACE FUNCTION list_active_tenant_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM tenants t
  WHERE t.deleted_at IS NULL
    AND t.subscription_status NOT IN ('SUSPENDED', 'CANCELLED');
$$;
