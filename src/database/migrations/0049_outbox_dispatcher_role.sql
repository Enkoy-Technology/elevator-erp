-- Security follow-up to 0048: the dispatcher originally connected as the
-- literal Postgres superuser (DATABASE_ADMIN_URL, the same role db:migrate/
-- db:seed use). A superuser bypasses RLS unconditionally on EVERY table,
-- not just outbound_messages — a live, pooled credential with that reach
-- sitting inside the always-on API process is a materially larger blast
-- radius than intended, and it never actually exercised the admin_bypass
-- POLICY 0048 wrote (a superuser doesn't need a policy to bypass RLS, so
-- that policy was decorative for the `postgres` role). CLAUDE.md's own rule
-- is narrower than what shipped: "Admin bypass only via an explicit
-- admin_bypass policy" — this migration makes that literally true instead
-- of true in spirit.
--
-- outbox_dispatcher is a dedicated role, scoped to exactly what
-- OutboxDispatcherRepository does: SELECT + UPDATE on outbound_messages,
-- nothing else, no ALTER DEFAULT PRIVILEGES (it must never automatically
-- gain access to a future table the way app_user does). It is not the
-- table owner and has no special identity — RLS applies to it like any
-- other role, and the retargeted admin_bypass policy below is what lets it
-- see rows outside its own tenant, IF AND ONLY IF the querying transaction
-- explicitly opts in with `SET LOCAL app.admin_bypass = 'on'`
-- (OutboxDispatcherRepository does this before every statement). Forget
-- that line and every query returns zero rows — a fail-closed default,
-- not a fail-open one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outbox_dispatcher') THEN
    CREATE ROLE outbox_dispatcher LOGIN PASSWORD 'dispatcher_password';
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO outbox_dispatcher;--> statement-breakpoint

-- Only this table, only these two verbs.
GRANT SELECT, UPDATE ON outbound_messages TO outbox_dispatcher;--> statement-breakpoint

-- Retarget from `postgres` (a real superuser — this policy never actually
-- gated anything for that role) to the role that now needs it to mean
-- something.
ALTER POLICY admin_bypass ON outbound_messages TO outbox_dispatcher;
