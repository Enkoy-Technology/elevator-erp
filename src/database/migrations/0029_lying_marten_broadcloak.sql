ALTER TABLE "customers" ADD COLUMN "name_normalized" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "name_normalized" text;--> statement-breakpoint
-- Backfill for rows written before this column existed. New rows are
-- populated by the application (CustomersRepository/ProjectsRepository) via
-- normalizeEthiopic(); the DB can't run that TS function, so this repeats
-- its Ethiopic-homophone fold table + gemination strip as a single
-- translate() call. The two literals below are GENERATED from
-- src/common/text/ethiopic-normalize.ts's ETHIOPIC_TRANSLATE_FROM/TO
-- exports and MUST stay byte-for-byte in sync with them — enforced by
-- src/database/migrations/ethiopic-backfill-sync.spec.ts, which reads this
-- file back and diffs it against the live table. If you change the fold
-- table, edit both, or the test fails.
--
-- translate(name, from, to): from[i] -> to[i]; from[38] (the gemination
-- mark U+135F) has no to[38] counterpart, so translate() deletes it.
UPDATE "customers" SET "name_normalized" = lower(translate("name", 'ሐሑሒሓሔሕሖሗኀኁኂኃኄኅኆኇሠሡሢሣሤሥሦሧፀፁፂፃፄፅፆፇዐዑዒዓዔዕዖ፟', 'ሀሁሂሃሄህሆሇሀሁሂሃሄህሆሇሰሱሲሳሴስሶሷጸጹጺጻጼጽጾጿአኡኢኣኤእኦ')) WHERE "name_normalized" IS NULL;--> statement-breakpoint
UPDATE "projects" SET "name_normalized" = lower(translate("name", 'ሐሑሒሓሔሕሖሗኀኁኂኃኄኅኆኇሠሡሢሣሤሥሦሧፀፁፂፃፄፅፆፇዐዑዒዓዔዕዖ፟', 'ሀሁሂሃሄህሆሇሀሁሂሃሄህሆሇሰሱሲሳሴስሶሷጸጹጺጻጼጽጾጿአኡኢኣኤእኦ')) WHERE "name_normalized" IS NULL;