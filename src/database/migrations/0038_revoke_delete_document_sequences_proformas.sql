-- Custom SQL migration file, put your code below! -----

-- Same no-op-grant gotcha as 0035/0037: migration 0001's schema-wide
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
-- DELETE ON TABLES TO app_user` grants DELETE to every new table the moment
-- it's created — so 0033_proformas_rls.sql's
-- `GRANT SELECT, INSERT, UPDATE ON <table> TO app_user` was a no-op against
-- privileges already present; it never actually removed DELETE for either
-- document_sequences or proformas. Caught on a fresh-database migration
-- replay (a locally drifted dev DB had stray manual REVOKEs masking this).
-- Revoke it here for both tables, same as 0028/0037.
REVOKE DELETE ON document_sequences FROM app_user;--> statement-breakpoint
REVOKE DELETE ON proformas FROM app_user;
