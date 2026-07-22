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
docker compose up -d          # Postgres 16 (host port 5434) + Redis 7
pnpm run db:migrate           # applies schema + RLS policies (owner connection)
pnpm run db:seed              # demo tenant + CEO user
pnpm run start:dev            # API on http://localhost:3002/v1
pnpm run web:dev              # Admin UI on http://localhost:3003
```

Demo login (UI or API): workspace `demo`, `ceo@demo.example.com` / `Demo!Passw0rd`.

- Admin UI: **http://localhost:3003**
- Swagger: **http://localhost:3002/docs**

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
