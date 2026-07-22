Generate and run database migrations after schema changes.

Usage: /db-migrate

Steps:
1. Run `pnpm run db:generate` to create the migration
2. Review the generated SQL in `src/database/migrations/`
3. Run `pnpm run db:migrate` to apply
4. Run `pnpm test` to verify no regressions
