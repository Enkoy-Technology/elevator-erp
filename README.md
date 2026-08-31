# Elevator ERP

Multi-tenant Cloud SaaS ERP for elevator & electromechanical companies.
NestJS 11 + TypeScript (strict), Drizzle ORM, PostgreSQL 16 with Row-Level
Security, Redis 7.

Architecture reference: `docs/Elevator_ERP_Technical_Architecture.md`.
Delivery plan: `docs/planning/ROADMAP.md`.

## Quick start

```bash
pnpm install
cp .env.example .env          # defaults work with the compose file below
pnpm run db:seed:dev          # once: demo tenant + CEO user (needs DB up — see below)
pnpm run kill                 # free API :3002 and UI :3003 leftovers
pnpm run dev                  # kill leftovers, then Postgres + migrate + API + admin UI
```

`pnpm run kill` stops leftover Nest/Next processes on **3002** / **3003** (the usual `EADDRINUSE` after a previous `dev` did not exit cleanly). `pnpm run dev` runs `kill` first so a restart does not hit that.

`pnpm run dev` starts everything needed for day-to-day work:

1. `docker compose up -d --wait` — Postgres **5434** + Redis **6379**
2. `pnpm run db:migrate` — apply pending migrations
3. API (`start:dev`) on **http://localhost:3002** and admin UI (`web:dev`) on **http://localhost:3003**

First-time only (after install / empty DB): run `pnpm run db:seed:dev` once (with infra up). You can run `pnpm run infra:up && pnpm run db:migrate && pnpm run db:seed:dev` then `pnpm run dev`.

`db:seed` refuses to run unless `ALLOW_DEMO_SEED=1` is set, in every
environment — `db:seed:dev` is `db:seed` with that override baked in for
local use. Never set `ALLOW_DEMO_SEED=1` when pointed at a production
database.

Demo login (UI or API): workspace `demo`, `ceo@demo.example.com` / `Demo!Passw0rd`.

- Admin UI: **http://localhost:3003**
- Swagger: **http://localhost:3002/docs**

Individual processes (if you prefer): `pnpm run start:dev`, `pnpm run web:dev`, `pnpm run infra:up` / `infra:down`.

## Verification

```bash
pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
pnpm run test:e2e   # tenant-isolation exit gate (requires migrated Postgres)
pnpm run web:typecheck && pnpm run web:build
```

## Multi-tenancy model

- Shared database, shared schema; every tenant-scoped table has `tenant_id`
  first and a composite PK `(tenant_id, id)`.
- The app connects as the non-owner `app_user` role, so PostgreSQL RLS applies
  to every query. `TenantDbService.withTenant()` wraps each operation in a
  transaction that sets a transaction-local `app.tenant_id` GUC.
- `test/e2e/tenant-isolation.e2e-spec.ts` proves isolation with RLS as the
  sole guard (no application-side filtering).
