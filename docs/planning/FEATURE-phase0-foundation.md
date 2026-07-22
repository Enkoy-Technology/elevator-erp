# Implementation Plan: Phase 0 — Foundation & Multi-Tenancy

## Task
Scaffold the NestJS 11 application with provable tenant isolation: Drizzle + PostgreSQL 16 RLS, JWT auth with tenant claims, and the shared error/rate-limit layer.

## Context
- Fresh scaffold: `src/` has only `.gitkeep` placeholders matching the AGENTS.md layout.
- TAD (`docs/Elevator_ERP_Technical_Architecture.md`) §1.4, §2, §5 define multi-tenancy, schema conventions, and auth.
- Roadmap Phase 0 exit gate: an integration test proves tenant A cannot read tenant B's rows — both at the app layer and with RLS as the sole guard.
- Local: Node 23, pnpm 11, Docker available (Postgres 16 + Redis 7 via docker-compose).

## Requirements
- [ ] `package.json` with the scripts promised in AGENTS.md (build, test, lint, typecheck, db:migrate, db:generate, db:seed, start:dev).
- [ ] TypeScript strict mode, ESLint flat config, Jest with `*.spec.ts` co-location.
- [ ] Config module: env vars validated at boot with Zod; app refuses to start on invalid config.
- [ ] Drizzle 0.40+ schema: `tenants`, `tenant_branding`, `users`, `permissions` with `tenant_id` first column, composite PK `(tenant_id, id)` on tenant-scoped tables, `deleted_at` soft delete.
- [ ] Migration enabling RLS + `tenant_isolation` policy template + `admin_bypass` policy + `set_tenant_context(uuid)` function.
- [ ] Tenant context: request-scoped tenant id injected via `set_config('app.tenant_id', ...)` before queries (transaction-wrapped, dedicated connection).
- [ ] Auth: bcrypt password hashing, JWT access (15 min) with `tenant_id`/`role`/`permissions` claims, refresh (7 days), `JwtAuthGuard`, `TenantGuard`, `RolesGuard` + `@Roles()` decorator.
- [ ] `all-exceptions.filter.ts` producing RFC 7807 Problem Details; custom exceptions (`TenantIsolationError`, `WorkflowTransitionError`, `SlaBreachError`).
- [ ] Rate limiting: `@nestjs/throttler` (Redis storage wired later; in-memory acceptable for Phase 0 with tenant-aware tracker).
- [ ] docker-compose for Postgres 16 + Redis 7.

## Open Questions
- Refresh token storage (DB table vs Redis): Phase 0 uses a hashed `refresh_token_hash` column on `users`; revisit for multi-session support.
- Redis-backed throttler deferred to the module that first needs distributed rate limits.

## Proposed Approach
1. Tooling scaffold (package.json, tsconfig, eslint, jest, nest-cli, drizzle.config.ts, docker-compose).
2. `src/config`: Zod-validated env loader exposed through `@nestjs/config`.
3. `src/database`: Drizzle schema files, migration SQL with RLS, `DatabaseModule` exposing a `TenantDb` request-scoped wrapper that runs every query inside a transaction prefixed with `set_tenant_context`.
4. `src/modules/auth`: login/refresh endpoints, JWT strategy, guards, decorators.
5. `src/common`: exception filter, custom exceptions, DTO validation pipe setup.
6. Tests: unit specs for auth service + calc of tenant context; integration spec (`test/e2e/tenant-isolation.e2e-spec.ts`) that seeds two tenants and proves isolation with RLS only (querying as the non-superuser app role without app-layer filters).

## Files to Modify
- `package.json`, `tsconfig*.json`, `eslint.config.mjs`, `jest` config, `nest-cli.json`, `drizzle.config.ts`, `docker-compose.yml` — new tooling
- `src/main.ts`, `src/app.module.ts` — bootstrap
- `src/config/` — env schema + config module
- `src/database/` — schema, migrations, tenant-context db service
- `src/modules/auth/` — auth module, service, controller, guards, strategies
- `src/common/` — filters, exceptions, decorators
- `test/e2e/` — tenant isolation test

## Verification
- [x] `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (14 unit tests), `pnpm run build` all green
- [x] `docker compose up -d` + `pnpm run db:migrate` applies RLS migration cleanly (host port 5434)
- [x] Tenant isolation e2e test passes against real Postgres (6 tests, RLS as sole guard)
- [x] Smoke test: `/v1/health`, login → tokens, `/v1/auth/me`, RFC 7807 401s (port 3002)

## Deferred (tracked for later phases)
- TOTP MFA enforcement at login (schema columns exist; wire up when user management lands).
- Redis-backed distributed throttler storage (in-memory now).
- Tenant subscription/active re-validation inside TenantGuard (claim-shape check only today).

## Risks
- RLS policies silently not applied if the app connects as table owner/superuser → use a dedicated non-owner `app_user` role in the migration and connect with it in the isolation test.
- Drizzle + `set_config` must share one connection → always wrap in `db.transaction()`.
