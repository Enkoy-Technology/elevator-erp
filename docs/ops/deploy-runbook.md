# Production deploy runbook

Steps that cannot live in code. Run in order, once per environment.

## 1. Database role

Before the first `pnpm run db:migrate` against a production database, pre-create
the `app_user` role so migration `0001_rls_policies.sql`'s `IF NOT EXISTS`
guard skips its hardcoded password:

```sql
CREATE ROLE app_user LOGIN PASSWORD '<strong generated password>';
```

If the migration already ran against this database with the default
password, rotate it instead:

```sql
ALTER ROLE app_user PASSWORD '<strong generated password>';
```

Never leave `app_user` on the migration's default password (`app_password`).

Same for `outbox_dispatcher` (migration `0049_outbox_dispatcher_role.sql`,
default password `dispatcher_password`) — pre-create or rotate it the same
way before/after that migration runs:

```sql
CREATE ROLE outbox_dispatcher LOGIN PASSWORD '<strong generated password>';
-- or, if 0049 already ran with the default:
ALTER ROLE outbox_dispatcher PASSWORD '<strong generated password>';
```

## 1a. Statutory rates

After every `pnpm run db:migrate`, run `pnpm run db:seed:rates`. This seeds
the current Ethiopian statutory rates (VAT, WHT, PAYE bands, pension) if they
are not already present — idempotent, safe to run on every deploy, no
`ALLOW_DEMO_SEED` gate (these are not demo data).

## 2. Required environment values

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Random, ≥32 chars. Generate with `openssl rand -base64 48`. |
| `TRUST_PROXY_HOPS` | The real number of reverse proxies in front of the API. Setting it too high lets clients spoof the throttle key. |
| `DATABASE_URL` | Connection string for `app_user` (RLS-restricted). |
| `DATABASE_ADMIN_URL` | Connection string for the owner role — used only by migrate/seed, never by the running app. |
| `OUTBOX_DISPATCHER_DATABASE_URL` | Connection string for the `outbox_dispatcher` role (SELECT+UPDATE on `outbound_messages` only, migration `0049_outbox_dispatcher_role.sql`) — used by the running app's outbox dispatcher (`OutboxDispatcherRepository`), which claims due messages across every tenant on a cron with no request-scoped tenant context. Deliberately NOT `DATABASE_ADMIN_URL`/the Postgres superuser: a dedicated least-privilege role kept away from tenant data by database-enforced grants, gated into seeing across tenants only via the `admin_bypass` RLS policy the dispatcher opts into per-transaction. See that class's doc comment for the full reasoning on why it cannot leak. |
| `CORS_ORIGINS` | Comma-separated list of allowed browser origins. |
| `SMS_PROVIDER` | Defaults to `noop` (logs, sends nothing — see `NoopSmsProvider`). Only real value until Task 3 ships a provider adapter. |

`ALLOW_DEMO_SEED` must **never** be set to `1` in production. Its presence
lets the demo tenant and its published credentials be seeded into a live
database.

## 3. Pre-ship check

Run before every production deploy:

```sh
pnpm audit --prod
```

Resolve or explicitly accept any reported vulnerabilities before shipping.

`pnpm audit --prod` currently reports `js-yaml` (via `@nestjs/swagger`) —
accepted because Swagger is disabled in production; re-evaluate on
dependency bumps.

## 4. Web app build

The admin UI's Content-Security-Policy `connect-src` is baked in at **build
time** from `NEXT_PUBLIC_API_URL` (see `web/next.config.ts`). The production
build must run with `NEXT_PUBLIC_API_URL` set to the real API origin:

```sh
NEXT_PUBLIC_API_URL=https://api.example.com/v1 pnpm run web:build
```

Shipping a build made without it silently defaults to `localhost:3002` in
the CSP, which blocks every API call in production with nothing but a
browser-console CSP violation — no server-side error, no failed health
check. If `NEXT_PUBLIC_API_URL` is set but not a valid URL, the build now
fails immediately instead of shipping that broken CSP.

## Known behaviors

- Single session per user: logging in on a second device signs the first out within 15 minutes. By design for launch.
- Production CSP keeps `script-src 'unsafe-inline'` (documented tradeoff — see `web/next.config.ts`).
