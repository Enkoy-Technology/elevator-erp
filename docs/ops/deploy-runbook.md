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

## 2. Required environment values

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Random, ≥32 chars. Generate with `openssl rand -base64 48`. |
| `TRUST_PROXY_HOPS` | The real number of reverse proxies in front of the API. Setting it too high lets clients spoof the throttle key. |
| `DATABASE_URL` | Connection string for `app_user` (RLS-restricted). |
| `DATABASE_ADMIN_URL` | Connection string for the owner role — used only by migrate/seed, never by the running app. |
| `CORS_ORIGINS` | Comma-separated list of allowed browser origins. |

`ALLOW_DEMO_SEED` must **never** be set to `1` in production. Its presence
lets the demo tenant and its published credentials be seeded into a live
database.

## 3. Pre-ship check

Run before every production deploy:

```sh
pnpm audit --prod
```

Resolve or explicitly accept any reported vulnerabilities before shipping.
