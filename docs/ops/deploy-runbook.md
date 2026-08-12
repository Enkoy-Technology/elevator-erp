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
| `SMS_ALLOWLIST` | Not required in production (ignored there) — required outside production the moment `SMS_PROVIDER` is anything but `noop`. See §5's allowlist guard rail below. |

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

**The allowlist guard rail — a structural safeguard, not a promise.**
Outside production (`NODE_ENV != production`), `SMS_ALLOWLIST` (comma-
separated E.164 numbers) decides who a non-`noop` deployment may actually
text: a message to any other number is blocked — visibly, marked `FAILED`
with an explanatory `lastError`, never silently dropped — before it ever
reaches the provider (`OutboxDispatcherService`/`sms-allowlist.ts`). Select
`afromessage`/`geezsms` outside production with `SMS_ALLOWLIST` empty and
the app **refuses to boot** (`src/config/env.schema.ts`) — a staging box
with live credentials and no allowlist is exactly the accident this exists
to prevent. In production the allowlist is ignored entirely (real customers
must receive real reminders); `OutboxModule` logs which mode is active at
every boot (`ENFORCED` / `not enforced — empty` / `IGNORED
(NODE_ENV=production)`) so nobody has to guess. `.env.example` ships
`SMS_ALLOWLIST=+251949922604` — the client's own test handset; never add a
real customer's or colleague's number to a non-production allowlist.

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
