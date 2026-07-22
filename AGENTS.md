# Elevator ERP Cloud SaaS Platform

Multi-tenant Cloud SaaS ERP for elevator & electromechanical companies.
NestJS 11 + TypeScript, Drizzle ORM, PostgreSQL 16 with RLS, Redis 7, BullMQ.

## Commands

Build: `pnpm run build`
Test: `pnpm test`
E2E test: `pnpm run test:e2e` (needs `docker compose up -d` + `pnpm run db:migrate`)
Lint: `pnpm run lint --fix`
Type check: `pnpm run typecheck`
Single test: `pnpm test src/modules/elevator-calc/elevator-calc.service.spec.ts`
DB migrate: `pnpm run db:migrate` (uses `DATABASE_ADMIN_URL`)
DB generate: `pnpm run db:generate`
DB seed: `pnpm run db:seed`
Dev server: `pnpm run start:dev`

Local dev: Postgres is on host port **5434** and the API on **3002** (5432/5433
and 3000/3001 are used by other projects on this machine). The app connects as
the non-owner `app_user` role (subject to RLS); only migrate/seed use the
`postgres` owner via `DATABASE_ADMIN_URL`.

## Code Style

- TypeScript strict mode. No `any` without an explicit `@ts-expect-error` comment.
- Named exports only. Never default exports.
- Use `const` exclusively. `let` only when reassignment is genuinely needed.
- Prefer `async/await` over `.then()/.catch()`.
- Repository pattern for DB access. Never write raw SQL in controllers/services.
- DTOs for all API inputs. Use `class-validator` decorators.
- Zod schemas for external API validation. Never trust external input.

Service pattern:

```ts
export class ElevatorCalcService {
  constructor(
    @InjectRepository(ElevatorSpec)
    private readonly specRepo: ElevatorSpecRepository,
  ) {}

  async calculateSpecs(input: CalcInputDto): Promise<CalcResultDto> {
    const result = this.computeShaftDimensions(input);
    return this.specRepo.create(result);
  }
}
```

## Architecture

```text
/src
  /modules      -> Feature modules (elevator-calc, projects, maintenance, etc.)
  /common       -> Shared utilities, guards, interceptors, decorators
  /database     -> Drizzle schema, migrations, RLS policies
  /config       -> Environment configuration, validation
  /workers      -> BullMQ job processors (pdf-gen, email, sms, billing)
  /websocket    -> Socket.io gateway handlers
  /types        -> Global TypeScript type definitions
```

Never import from `/modules/X` into `/modules/Y`. Use `/common` for shared code.
Never modify files in `/database/migrations/` after they are committed.
Never commit `.env` or any file containing secrets.

## Multi-Tenancy Rules

- Every tenant-scoped table has composite PK: `(tenant_id, id)`.
- Drizzle middleware injects `set_config('app.tenant_id', ...)` before every query.
- RLS policies enforce tenant isolation at the DB level. Application layer is first defense.
- JWT token contains a `tenant_id` claim. Validate in `TenantGuard` before any DB operation.
- Never bypass RLS in production. Admin bypass only via an explicit `admin_bypass` policy.

## Domain Conventions

- Elevator specs follow EN 81-20/50, ISO 8100, ASME A17.1 standards.
- Pricing uses arbitrary-precision decimal arithmetic (never float for money).
- Project status workflow is a DAG: LEAD -> SITE_SURVEY -> SPEC_CALCULATION -> QUOTATION -> PROFORMA -> CONTRACT -> EXECUTION -> COMPLETED.
- Maintenance recurrence: DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, BIANNUAL, ANNUAL, CUSTOM.
- Breakdown severity: EMERGENCY (30min SLA), CRITICAL (60min), HIGH (4hr), MEDIUM (24hr), LOW (48hr).
- Inventory transactions are an immutable ledger. Never delete, only create reversing entries.

## Error Handling

Let domain errors propagate to the global exception filter. Do not wrap individual calls in try/catch.
Use custom exception classes: `TenantIsolationError`, `WorkflowTransitionError`, `SlaBreachError`.
The global filter in `/common/filters/all-exceptions.filter.ts` catches everything and formats RFC 7807 Problem Details.

## Testing

- Unit tests: Jest, co-located as `*.spec.ts` next to source.
- E2E tests: `test/e2e/` using supertest. One test file per module.
- Mock external APIs (Stripe, Twilio, SES, Google Maps) in unit tests.
- Test the calculation engine against the spec examples in `docs/elevator-calc-formulas.md`.
- Run `pnpm test` before every commit. CI runs the full suite.

## Git

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
Branch format: `type/short-description` (e.g., `feat/elevator-calc-module`).
Squash merge into `main` only. Require PR review for all changes.
