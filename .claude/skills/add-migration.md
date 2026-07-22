# Skill: Add Database Migration

Generate and apply a Drizzle migration after a schema change, with RLS.

## Parameters
- `description`: short kebab-case description of the change

## Steps
1. Edit the schema in `src/database/schema/*.ts`
2. Ensure every tenant-scoped table has `tenantId` and composite PK `(tenant_id, id)`
3. Run `pnpm run db:generate` to produce the migration SQL
4. Review the generated SQL in `src/database/migrations/` — check for:
   - Accidental data loss (DROP COLUMN, type narrowing)
   - Missing RLS policy on any new tenant-scoped table
   - Missing indexes on foreign keys / tenant_id
5. Add/adjust RLS policies referencing `current_setting('app.tenant_id')::uuid`
6. Run `pnpm run db:migrate`
7. Run `pnpm test` to catch regressions
8. Never edit a migration file after it is committed — create a new one

## Guardrails
- Immutable-ledger tables (inventory transactions) must never get destructive migrations.
- Confirm the migration is reversible or has a documented rollback.

## Example Invocation
"Add a migration for the tenant_pricing_factors table"
