-- Adds these as NOT NULL with no default, which hard-fails if proformas has
-- any existing rows (ADD COLUMN ... NOT NULL backfills every row with NULL
-- first, then rejects the NOT NULL constraint). Only run this against an
-- empty proformas table — true for every real environment as of this
-- migration (proformas is brand new this phase); it required deleting one
-- stray local-dev test row on the machine this was authored on.
ALTER TABLE "proformas" ADD COLUMN "technical_spec" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "pricing_breakdown" jsonb NOT NULL;