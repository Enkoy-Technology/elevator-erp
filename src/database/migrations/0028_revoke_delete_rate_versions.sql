-- Custom SQL migration file, put your code below! -----

-- rate_versions is an append-only ledger of statutory rate history: rows are
-- closed (valid_to set) and superseded, never removed — see
-- RatesRepository.rotate. Migration 0001's schema-wide default privileges
-- grant app_user DELETE on every table, including this global (non-RLS)
-- one; revoke it here so a bug or compromised app credential cannot erase
-- rate history. This is a deliberate, table-specific exception to the
-- schema-wide grant, not an oversight — writes to this table are otherwise
-- gated at the application layer to ADMIN (see RatesController).
REVOKE DELETE ON rate_versions FROM app_user;
