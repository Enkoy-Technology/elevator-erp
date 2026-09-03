-- Drizzle regenerated this because 0066 was hand-written and left no
-- meta/0066_snapshot.json, so drizzle's tracked state still lacked the role
-- and every future `db:generate` would keep re-proposing it. Running
-- db:generate produced this file AND the snapshot, which closes that drift.
--
-- IF NOT EXISTS makes it a no-op wherever 0066 already ran — the local
-- database and the Neon demo both have the value already. On a fresh
-- database 0066 adds it and this does nothing. Without the guard, every
-- existing environment would fail here with "enum label already exists".
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'GENERAL_MANAGER' BEFORE 'SALES_MANAGER';
