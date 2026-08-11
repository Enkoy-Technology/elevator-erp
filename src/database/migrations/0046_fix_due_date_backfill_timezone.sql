-- Custom SQL migration file, put your code below! --

-- Fix-wave-c #4 follow-up (code review caught this before merge): 0045
-- computed the backfilled due_date via `issued_at::date`, which casts a
-- timestamptz to date using the Postgres SESSION timezone — UTC in this
-- deployment (confirmed: `SHOW TimeZone` on the live instance, no TZ
-- override anywhere in migrate.ts/docker-compose.yml). Every other
-- calendar-date computation in this codebase, including resolveDueDate
-- (invoices.repository.ts) — the exact logic 0045 claimed to replicate —
-- derives "today's date" via todayIso(), which explicitly uses
-- Africa/Addis_Ababa (UTC+3), not UTC. For an invoice issued between
-- 21:00:00 and 23:59:59 UTC (00:00-02:59 Addis-local, the next calendar
-- day there), 0045's cast landed one day earlier than resolveDueDate would
-- have picked at issue time.
--
-- Per this repo's convention, migrations already committed are never
-- edited — this fixes forward instead of rewriting 0045. Scoped narrowly
-- to rows 0045 could plausibly have touched: due_date currently equals
-- EXACTLY what 0045's buggy UTC-cast formula would have produced, AND the
-- UTC-cast date genuinely differs from the Addis-local one (the exact
-- trigger condition) — so a caller-supplied due_date that happens to match
-- the buggy formula by coincidence, but was NOT written by 0045, is only
-- touched in that one indistinguishable-by-construction edge case.
-- Idempotent: once corrected, due_date no longer matches the UTC formula,
-- so a second run matches zero rows. Verified against the live dev DB: 0
-- rows matched (all 3 due_date rows there fall on the same UTC/Addis-local
-- calendar day), so this is a no-op today and a correctness fix for any
-- future 0045-touched row in the affected window.
update invoices
set due_date = (issued_at at time zone 'Africa/Addis_Ababa')::date + c.payment_terms_days::int
from customers c
where c.tenant_id = invoices.tenant_id
  and c.id = invoices.customer_id
  and invoices.due_date = invoices.issued_at::date + c.payment_terms_days::int
  and invoices.issued_at::date <> (invoices.issued_at at time zone 'Africa/Addis_Ababa')::date;
