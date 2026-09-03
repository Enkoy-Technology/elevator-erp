# Free public demo: Cloud Run + Neon (API service)

**This is the DEMO path. It is additive.** The real deployment the client
gets is still `docker-compose.prod.yml` / `.uat.yml` + `Caddyfile` +
`docs/ops/deploy-runbook.md`, on a server in Ethiopia. Nothing in this
directory replaces it, and the same `Dockerfile` builds both.

> **Start with `deploy/deploy-demo.sh` instead.** It does everything below in
> one idempotent command — generating the secrets, running migrations and the
> seed as their own explicit step, deploying both services in the order the
> build ARGs force, and wiring `CORS_ORIGINS` back to the real web URL. The
> walkthrough, the free-tier limits and the teardown are in
> `docs/ops/deploy-runbook.md`, section "Free public demo".
>
> Keep reading here when a step of that script fails and you need to run it by
> hand, or need the Neon-specific rough edges at the bottom of this file.
> One correction to note if you do: steps 2 and 3 below are collapsed by
> `dist/database/demo-bootstrap.cli.js` (that exact filename — `nest build`
> keeps the `.cli`), which also rotates both role passwords off the defaults
> the migrations hardcode.

---

## ⚠️ LEGAL — read before putting a single row in this database

Ethiopian Personal Data Protection Proclamation **1321/2024, Art 22(1)**
requires personal data collected in Ethiopia to be stored on a server **in
Ethiopia**. Cloud Run and Neon are both abroad.

**This demo is lawful only for as long as it contains fictional seeded data.**

- Never `db:bootstrap` a real tenant here.
- Never import a real customer, employee, or supplier list.
- Never let the client type a real person's name, phone, or TIN into it.
- The moment real personal data lands in this database, the deployment is
  unlawful and must be deleted, not "cleaned up later".

Do not remove or soften this warning, or the in-app banner, when editing
these files.

---

## Which connection string goes where

Neon gives every project **two** hostnames for the same database. They are
not interchangeable.

| Env var | Neon endpoint | Role | Used by |
|---|---|---|---|
| `DATABASE_URL` | **pooled** — `ep-xxx-pooler.REGION.aws.neon.tech` | `app_user` | the running API (RLS applies to it) |
| `OUTBOX_DISPATCHER_DATABASE_URL` | **pooled** | `outbox_dispatcher` | the running API — **required at boot**, `OutboxModule` throws without it |
| `DATABASE_ADMIN_URL` | **direct** — `ep-xxx.REGION.aws.neon.tech` (no `-pooler`) | Neon project owner (`neondb_owner`) | migrate / seed **only** — never set on the running service |

Why the direct endpoint for migrations: the pooled endpoint is PgBouncer in
transaction mode. Migrations do DDL, `CREATE ROLE`, and `CREATE EXTENSION`,
and `drizzle` runs them inside advisory-locked sessions — all of which want
a real session, not a pooled one. The app is the opposite case: Cloud Run
scales to N instances × `max: 20` connections, which exhausts a free-tier
Neon compute in one traffic spike, so the app goes through the pooler.

Every string needs `?sslmode=require`. `pg` 8.22 parses `sslmode` out of the
connection string and verifies Neon's publicly-trusted certificate against
Node's bundled CA store — no code change and no `NODE_TLS_REJECT_UNAUTHORIZED`
anywhere. (`pg-connection-string` prints a one-off deprecation warning for
bare `require`; `sslmode=verify-full` is identical here, stricter on paper,
and silences it.)

Put `JWT_SECRET` and all three connection strings in Secret Manager
(`--set-secrets`), not in `--set-env-vars`. Do not commit them.

---

## 1. Build and push

Cloud Run runs **linux/amd64**. A Mac builds arm64 by default and the
service will fail to start with no useful error.

```sh
export PROJECT=your-gcp-project
export REGION=europe-west1              # any region; none are in Ethiopia
export IMAGE="$REGION-docker.pkg.dev/$PROJECT/elevator-erp/api:$(git rev-parse --short HEAD)"

gcloud artifacts repositories create elevator-erp \
  --repository-format=docker --location="$REGION"          # once

docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
```

## 2. Migrate — one-shot, from your laptop

Migrations must **not** run on API startup: Cloud Run runs many instances
against one database. Run them once, by hand, before deploying. The image
already carries `dist/database/migrate.js` and the `.sql` files, so this
needs no Cloud Run Job, no VPC connector, and no local `node_modules`:

```sh
docker run --rm --platform linux/amd64 \
  -e DATABASE_ADMIN_URL="postgresql://neondb_owner:PW@ep-xxx.$REGION.aws.neon.tech/neondb?sslmode=require" \
  "$IMAGE" node dist/database/migrate.js
```

(A Cloud Run Job would work too and buys nothing: Neon is reachable over the
public internet, so the laptop and the job have identical access.)

## 3. Seed — fictional data only

```sh
export ADMIN_URL="postgresql://neondb_owner:PW@ep-xxx.$REGION.aws.neon.tech/neondb?sslmode=require"

# statutory VAT/PAYE/pension/WHT rates — not demo data, always needed
docker run --rm --platform linux/amd64 -e DATABASE_ADMIN_URL="$ADMIN_URL" \
  "$IMAGE" node dist/database/seed-rates.cli.js

# the fictional "Demo Elevators PLC" tenant + demo logins
docker run --rm --platform linux/amd64 \
  -e DATABASE_ADMIN_URL="$ADMIN_URL" -e ALLOW_DEMO_SEED=1 \
  "$IMAGE" node dist/database/seed.js
```

**If seeding fails with `new row violates row-level security policy`**, see
"Neon has no superuser" below.

## 4. Deploy the API service

```sh
gcloud run deploy elevator-erp-api \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 3002 \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 8 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "^##^TRUST_PROXY_HOPS=1##CORS_ORIGINS=https://elevator-erp-web-xxxx.$REGION.run.app" \
  --set-secrets "JWT_SECRET=elevator-jwt-secret:latest,DATABASE_URL=elevator-db-url:latest,OUTBOX_DISPATCHER_DATABASE_URL=elevator-outbox-db-url:latest"
```

Flags that are not arbitrary:

- **`--memory 1Gi`** — measured, do not lower. One heavy PDF render plus
  ~180 MB of app ballast fits in 512 MB; three concurrent renders do not.
- **`--port 3002`** — the image's own `ENV PORT=3002`. Cloud Run injects
  `PORT` and overrides the image ENV anyway, but matching them means the
  container is correct whichever value arrives. `src/main.ts` reads `PORT`
  from the validated env and binds `0.0.0.0`.
- **`--concurrency 8`** — ceiling: the 1 GiB figure bounds *three concurrent
  PDF renders*, not eight arbitrary requests. 8 assumes most requests are
  ordinary JSON. If you see OOM restarts under demo load, drop to 3.
- **`--set-env-vars "^##^..."`** — the `^##^` delimiter is required because
  `CORS_ORIGINS` is itself a comma-separated list.
- **`TRUST_PROXY_HOPS=1`** — Cloud Run puts exactly one proxy in front. Left
  at the default `0`, the throttler keys every request on Google's frontend
  IP and the whole demo shares one 200-req/10s bucket.
- **No `SMS_PROVIDER`** — the default `noop` logs and sends nothing. Leave it.
  A demo must not be able to text a real handset.
- **No `DATABASE_ADMIN_URL`** — the running service has no business holding
  owner credentials.

---

## Known rough edges (deliberate, not bugs)

**Neon has no superuser.** `tenants`, `users`, and friends have `FORCE ROW
LEVEL SECURITY` (migration `0001`), and `seed.ts` / `bootstrap-tenant.cli.ts`
write to them as `DATABASE_ADMIN_URL`, relying on a real Postgres superuser
bypassing RLS unconditionally. `neondb_owner` is not one. Whether membership
in `neon_superuser` is enough could not be verified without a live Neon
project. If step 3 fails, run this once against the **direct** endpoint:

```sql
ALTER ROLE neondb_owner SET app.admin_bypass = 'on';
```

The `admin_bypass` policy on those tables has no `WITH CHECK`, so Postgres
uses its `USING` expression for `INSERT` too — which makes this a supported
path, not a hack, and it edits no committed migration.

**`GET /` returns 404 on the API URL.** `main.ts` redirects `/` to `/docs`,
and Swagger is switched off when `NODE_ENV=production` (which the image
sets). That is a deliberate production security decision and is not being
relaxed for a demo. Visitors should be sent to the **web** service URL.

**Scheduled work does not run while idle.** `min-instances 0` means the
`@Cron` outbox dispatcher and reminder sweeps only fire when an instance
happens to be warm. Irrelevant while `SMS_PROVIDER=noop`; it would not be
acceptable on the real on-prem deployment, which is always on.

**Free-tier Neon suspends after ~5 minutes idle.** The first request after a
suspend pays a cold start on both Cloud Run and Neon.
