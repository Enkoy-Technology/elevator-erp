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
| `SMS_PROVIDER` | `noop` (default), `afromessage`, or `geezsms` — see §5 below. |
| `SMS_LIVE` | `1` in production — the only switch that lets outbound SMS reach real numbers. See §5 below. |
| `SMS_ALLOWLIST` | Not required once `SMS_LIVE=1` (ignored there) — required while `SMS_LIVE` is not `1` the moment `SMS_PROVIDER` is anything but `noop`. See §5's allowlist guard rail below. |

`ALLOW_DEMO_SEED` must **never** be set to `1` in production. Its presence
lets the demo tenant and its published credentials be seeded into a live
database.

## 5. SMS provider

`SMS_PROVIDER=noop` is the **safe default** — it logs and sends nothing, so
a fresh deployment never SMSes anyone by accident. The client picked both
AfroMessage and GeezSMS to test real delivery before committing to one;
switching between them (or back to `noop`) is a one-env-var change, no code
change. Selecting `afromessage`/`geezsms` without its credential below fails
`ConfigModule.forRoot` at boot (`src/config/env.schema.ts`) — a
selected-but-uncredentialed provider never silently no-ops in production.

| Variable | Provider | Required? | Notes |
|---|---|---|---|
| `AFROMESSAGE_API_KEY` | AfroMessage | Required when `SMS_PROVIDER=afromessage` | Bearer token from your AfroMessage account. |
| `AFROMESSAGE_SENDER` | AfroMessage | Optional | Verified Sender Name (`sender` field). Omit to use the account's own default sender. |
| `GEEZSMS_TOKEN` | GeezSMS | Required when `SMS_PROVIDER=geezsms` | API token from https://geezsms.com/#/api. |
| `GEEZSMS_SENDER_ID` | GeezSMS | Optional | Dedicated shortcode id (`shortcode_id` field). Omit to use GeezSMS's shared shortcode. |

**`SMS_LIVE` is the only switch that lets outbound SMS reach real phone
numbers — deliberately independent of `NODE_ENV`.** The idiomatic Dockerfile
for a built Node app sets `NODE_ENV=production`, and that is exactly the
Dockerfile a deploy phase writes for staging too — gating live sending on
`NODE_ENV` would mean the moment such a staging container exists, the
allowlist below and the boot refusal are silently skipped on a box that may
hold the client's real credentials. `SMS_LIVE` decouples "is this a
production build" from "may this box text real people", permanently: set
`SMS_LIVE=1` explicitly in production to reach real recipients; leave it
unset (default `0`) everywhere else, regardless of `NODE_ENV`. It accepts
only `0`/`1` — a typo like `SMS_LIVE=true` fails loudly at boot
(`src/config/env.schema.ts`) instead of silently staying off.

**The allowlist guard rail — a structural safeguard, not a promise.** While
`SMS_LIVE` is not `1`, `SMS_ALLOWLIST` (comma-separated E.164 numbers)
decides who a non-`noop` deployment may actually text: a message to any
other number is blocked — visibly, marked `FAILED` with an explanatory
`lastError`, never silently dropped — before it ever reaches the provider
(`OutboxDispatcherService`/`sms-allowlist.ts`). Select `afromessage`/
`geezsms` with `SMS_LIVE` not `1` and `SMS_ALLOWLIST` empty and the app
**refuses to boot** (`src/config/env.schema.ts`) — a box with live
credentials, `SMS_LIVE` unset, and no allowlist is exactly the accident this
exists to prevent. Once `SMS_LIVE=1` the allowlist is ignored entirely (real
customers must receive real reminders); `OutboxModule` logs which mode is
active at every boot (`ENFORCED` / `not enforced — empty` / `IGNORED
(SMS_LIVE=1)`) so nobody has to guess. `.env.example` ships
`SMS_ALLOWLIST=+251949922604` — the client's own test handset; never add a
real customer's or colleague's number to a non-live allowlist.

**Sender-ID registration is the long-lead item — start it before launch, not
after.** Sending SMS from a branded name/shortcode (rather than the
provider's shared default) requires that provider's own registration process
(business documents, approval). Neither vendor publishes a lead time on their
public docs; treat 1–2 weeks as an optimistic floor and confirm directly with
whichever provider the client keeps. Until that registration clears, deploy
with `AFROMESSAGE_SENDER`/`GEEZSMS_SENDER_ID` unset — messages still send
from the provider's shared default.

**UNVERIFIED — read before the first live send.** Both adapters
(`src/modules/outbox/providers/afromessage.provider.ts`,
`geezsms.provider.ts`) were built against each vendor's own published
documentation (AfroMessage's doc-site JS bundle; GeezSMS's official Postman
collection), not a guess — but neither vendor documents every response shape
in full:
- **AfroMessage**: the success/error envelope (`acknowledge`/`response`) and
  the `to`/`message`/`sender`/`callback` request fields are confirmed
  verbatim from the vendor's own docs. `response.message_id` is confirmed as
  the success id field; a success response missing it throws loudly instead
  of guessing (watch `lastError` on the message log for this).
- **GeezSMS**: the request fields (`token`/`phone`/`msg`/`shortcode_id`) and
  the ONE documented success response (`message_status: "success"`,
  `api_log_id`) are confirmed verbatim from the vendor's own Postman
  collection. **No failure-response example is published for `/sms/send`** —
  this adapter's failure detection (anything not `message_status: "success"`)
  is inferred, not vendor-confirmed. **GeezSMS's own docs describe the phone
  format as "must start with 2519"**, with no mention of Safaricom Ethiopia's
  `07…` numbers — confirm Safaricom delivery explicitly (see the delivery
  test below).

**Delivery test — run before trusting either provider in production.** A
provider reporting "sent"/`acknowledge: success` is not proof a handset
received anything. For each provider you intend to use:
1. Send one **English** and one **Amharic** message to a real **Ethio
   Telecom** SIM.
2. Send one **English** and one **Amharic** message to a real **Safaricom
   Ethiopia** SIM.
3. Confirm arrival **on the handset** for all four, not just a success
   response from the API.
4. Note delivery latency and any character/encoding issues on the Amharic
   messages (see `common/sms-segments.ts` for the GSM-7/UCS-2 segment split
   this codebase already computes).

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

---

# Deploying the compose bundle

Two deployment shapes share one bundle. `docker-compose.prod.yml` is the
LAN install for the client's own Addis Ababa server. Adding
`docker-compose.uat.yml` on top turns the same bundle into an
internet-facing UAT box behind TLS. Everything below marked **LAN** or
**UAT** applies to one; unmarked steps apply to both.

## First run

Prerequisites on the target box: Docker Engine with the Compose plugin, and
the repository (or at minimum `docker-compose.prod.yml`, `Caddyfile`, the
two `Dockerfile`s and the source needed to build them).

### 1. Write `.env` next to the compose file

Never committed. Generate every secret on the box; do not reuse a value
from another environment.

```sh
# Three role passwords and the JWT secret — all independent.
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # app_user
openssl rand -base64 24   # outbox_dispatcher
openssl rand -base64 48   # JWT_SECRET
```

```sh
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generated>
POSTGRES_DB=elevator_erp

# `postgres` is the compose service name — these resolve on the private
# compose network, which is the only place Postgres is reachable at all.
DATABASE_URL=postgresql://app_user:<generated>@postgres:5432/elevator_erp
DATABASE_ADMIN_URL=postgresql://postgres:<POSTGRES_PASSWORD>@postgres:5432/elevator_erp
OUTBOX_DISPATCHER_DATABASE_URL=postgresql://outbox_dispatcher:<generated>@postgres:5432/elevator_erp

JWT_SECRET=<generated>
NODE_ENV=production

# LAN: the server's address on the office network.
NEXT_PUBLIC_API_URL=http://192.168.1.10:3002/v1
CORS_ORIGINS=http://192.168.1.10:3003
TRUST_PROXY_HOPS=0

# UAT: one origin serves both, so these three agree and CORS is moot.
# SITE_ADDRESS=erp-demo.example.com
# NEXT_PUBLIC_API_URL=https://erp-demo.example.com/v1
# CORS_ORIGINS=https://erp-demo.example.com
# (TRUST_PROXY_HOPS is forced to 1 by the UAT overlay — do not set it here.)

SMS_PROVIDER=noop
SMS_LIVE=0
BACKUP_RETENTION_DAYS=7
```

`ALLOW_DEMO_SEED` must not appear in this file at all. See §2.

### 2. Pre-create the two database roles

Start Postgres alone, then create the roles **before** the first migration
so `0001`/`0049` skip their hardcoded default passwords (§1 above explains
why this matters):

```sh
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d elevator_erp -c \
  "CREATE ROLE app_user LOGIN PASSWORD '<generated>';
   CREATE ROLE outbox_dispatcher LOGIN PASSWORD '<generated>';"
```

### 3. Migrate and seed the statutory rates

The shipped `api` image cannot run migrations itself — `pnpm prune --prod`
strips `tsx` and `drizzle-kit` before the runtime stage. That is what
`docker-compose.migrate.yml` is for; it mounts a full `node_modules`
(including devDependencies) that you bring from the build machine.

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.migrate.yml \
  run --rm migrate src/database/migrate.ts
docker compose -f docker-compose.prod.yml -f docker-compose.migrate.yml \
  run --rm migrate src/database/seed-rates.cli.ts
```

### 4. Create the first tenant and administrator

`db:seed` is the **demo** seeder: it writes a tenant literally named "Demo
Elevators PLC" with the published credentials `ceo@demo.example.com` /
`Demo!Passw0rd`, which is why it refuses to run without `ALLOW_DEMO_SEED=1`.
On any box reachable from outside the office, running it would publish a
known login. Use the bootstrap entrypoint instead — same job, real values,
no gate, idempotent:

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.migrate.yml \
  run --rm \
  -e TENANT_SLUG=shining-star \
  -e TENANT_NAME='Shining Star Electromechanical Works' \
  -e ADMIN_EMAIL=admin@shiningstar.example \
  -e ADMIN_PASSWORD='<generated, 12+ chars>' \
  migrate src/database/bootstrap-tenant.cli.ts
```

It refuses a short password and a malformed slug rather than creating a
tenant nobody can log into. The password is never logged. Hand it to the
client over a channel that is not this terminal, and have them change it.

### 5. Build and start

```sh
# LAN
docker compose -f docker-compose.prod.yml up -d --build

# UAT — prod first, then the overlay
docker compose -f docker-compose.prod.yml -f docker-compose.uat.yml up -d --build
```

`NEXT_PUBLIC_API_URL` is a **build** argument, not a runtime variable: it is
compiled into the JavaScript bundle and into the CSP `connect-src`.
Changing it later means `--build`, not `restart`.

### 6. Verify before handing over the URL

```sh
docker compose -f docker-compose.prod.yml ps        # every service healthy
curl -sf https://<host>/v1/health                   # UAT (or http://…:3002 on LAN)
docker compose -f docker-compose.prod.yml logs backup | head   # first dump ran
```

Then in a browser: log in as the bootstrapped administrator, open
Settings and set the company name, slogan, logo and colours, and download
one quotation PDF. That last step is the real check — it is the only one
that exercises Chromium, fonts and the branding row together.

## UAT specifics

### DNS before first start

`SITE_ADDRESS` must already resolve to the box's public IP when Caddy first
starts. Let's Encrypt validates over HTTP on port 80; if the name does not
resolve yet, Caddy falls back to a self-signed certificate and the client
gets a browser warning. Point the A record first, confirm with `dig`, then
`up -d`.

No domain to hand? `<dashed-ip>.sslip.io` (e.g. `203-0-113-10.sslip.io`)
resolves to that IP with no signup and Let's Encrypt will issue for it. It
works, and it looks like infrastructure — fine for an internal test, not
for a URL you put in front of a client you are selling to.

### The firewall is not optional

The overlay stops `api` and `web` publishing their own ports, so Caddy is
the only door in the compose file. Close the rest at the cloud firewall too
— ingress on 22, 80 and 443 only. On Oracle Cloud this is the VCN security
list **and** the instance's own iptables, which its Ubuntu images ship
pre-populated; changing only the security list is the usual reason a
correctly-configured box still refuses traffic.

### What UAT is not

Demo and test data only. Article 22 of Proclamation 1321/2024 requires
personal data collected in Ethiopia to be stored on a server in Ethiopia,
and no free or near-free host exists inside the country — every option here
is Europe or North America. A UAT box with synthetic data raises no Article
22 question. The moment real customer names, phone numbers or contracts are
entered, it does. Keep production on the client's own Addis server, and say
this out loud to the client rather than leaving it implied.

## Backups

The `backup` sidecar runs `pg_dump -Fc` on start and every 24h after,
writing to the `backups` volume and pruning past `BACKUP_RETENTION_DAYS`
(default 7). It restarts with the stack, so a power cut produces more
backup coverage, not less.

### Put the backups on a second disk

The `backups` volume is separate from `pgdata_prod` on purpose, but naming
two volumes does not put them on two disks. Until you bind it to different
physical storage, it is a copy, not a backup — one disk failure takes both.

```sh
# Attach and mount a second disk at /mnt/backups first, then:
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/mnt/backups elevator-erp_backups
```

On-premises only. Do not point this at S3 or any offsite target — see
Article 22 above and `docs/planning/DECISIONS-platform-and-ethiopian-compliance.md` §8.

### Restore drill — run it once before go-live, then quarterly

A backup nobody has restored is a hypothesis. Restore into a throwaway
database on the same box; this never touches the live one:

```sh
LATEST=$(docker compose -f docker-compose.prod.yml exec -T backup \
  sh -c 'ls -1t /backups/elevator_erp_*.dump | head -1')

docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c 'CREATE DATABASE restore_drill;'

docker compose -f docker-compose.prod.yml exec -T backup \
  sh -c "PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -h postgres -U \$POSTGRES_USER \
         -d restore_drill --no-owner --no-privileges '$LATEST'"

# Prove it: row counts should match the live database.
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d restore_drill -c \
  'SELECT (SELECT count(*) FROM customers) AS customers,
          (SELECT count(*) FROM invoices)  AS invoices,
          (SELECT count(*) FROM payments)  AS payments;'

docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c 'DROP DATABASE restore_drill;'
```

`--no-owner --no-privileges` matters: the dump references `app_user` and
`outbox_dispatcher`, and a restore that tries to reassign ownership fails
noisily on a box where those roles have different passwords. Record the
date of each drill — an undated claim that backups work is not evidence.

## Day-2 operations

```sh
# Logs (one service or all)
docker compose -f docker-compose.prod.yml logs -f api

# Update to a new build
git pull && docker compose -f docker-compose.prod.yml up -d --build

# Rotate the administrator password: log in as another ADMIN/CEO and use
# the employees screen. It evicts that user's live sessions.

# Restart policy is unless-stopped on every service, so the stack comes
# back by itself after a power cut. `docker compose stop` is remembered
# across reboots — use `down`/`up -d` if you want it to come back.
```
