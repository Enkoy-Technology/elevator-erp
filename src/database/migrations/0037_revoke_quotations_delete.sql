-- Custom SQL migration file, put your code below! -----

-- quotations is soft-delete (deleted_at), never a hard row removal — see
-- QuotationsRepository. 0031_quotations_rls.sql's
-- `GRANT SELECT, INSERT, UPDATE, DELETE ON quotations TO app_user` carried
-- DELETE forward from an earlier revision without noticing the table had
-- already moved to soft-delete; revoke it here so a bug or compromised app
-- credential cannot hard-delete a quotation out from under its audit trail.
-- Same append-only-table reasoning as
-- 0028_revoke_delete_rate_versions.sql, applied to a soft-delete table
-- instead of an immutable-ledger one.
REVOKE DELETE ON quotations FROM app_user;
