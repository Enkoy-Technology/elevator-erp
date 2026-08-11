-- Migration 0040 (0040_perfect_morgan_stark.sql) added invoices.wht_voucher_ref
-- and invoices.wht_recorded_at, but its journal entry's `when` timestamp
-- (1786396290398) is EARLIER than 0039's (1786400000000) — an out-of-order
-- journal that drizzle-orm's migrator (pg-core/dialect.js: `migrate`) never
-- applies, since it only runs a migration whose `folderMillis` is greater
-- than the single latest `created_at` already recorded, not whichever
-- migrations are simply missing by hash. Any database that already had 0039
-- applied before 0040 landed on this branch has silently never received
-- these two columns — confirmed against this repo's own dev Postgres.
--
-- This migration is deliberately idempotent (IF NOT EXISTS) so it is a
-- harmless no-op on any environment where 0040 DID apply correctly, and a
-- real fix on any environment (like this one) where it did not. 0040 itself
-- is left untouched — CLAUDE.md forbids editing a migration after it is
-- committed, and its journal entry can't be reordered without invalidating
-- the hash chain every already-migrated database is keyed on.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "wht_voucher_ref" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "wht_recorded_at" timestamp with time zone;
