ALTER TABLE "product_types" ADD COLUMN "kg_step" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Re-express the seeded per-kg rates as the sheet writes them (per 100 kg on the
-- passenger class, per 1,000 kg on car and goods lifts). Only rows still at the
-- seeded per-kg figure are touched, so a tenant's own edits stay as they are.
UPDATE "product_types" SET "kg_step" = 100, "per_kg_etb" = 100000 WHERE "code" IN ('PASSENGER', 'HOSPITAL', 'PANORAMIC', 'HOME') AND "kg_step" = 1 AND "per_kg_etb" = 1000 AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "product_types" SET "kg_step" = 1000, "per_kg_etb" = 500000 WHERE "code" = 'CAR_LIFT' AND "kg_step" = 1 AND "per_kg_etb" = 500 AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "product_types" SET "kg_step" = 1000, "per_kg_etb" = 400000 WHERE "code" IN ('CAR_PLATFORM_LIFT', 'CAR_STACKING_LIFT', 'CARGO') AND "kg_step" = 1 AND "per_kg_etb" = 400 AND "deleted_at" IS NULL;--> statement-breakpoint
-- The sheet writes the stacking lift's capacity term first; the escalator's rise as "Rise".
UPDATE "product_types" SET "formula" = 'Base price + ((C − refC) / kgStep) × perKg + (L − refN) × perStop' WHERE "code" = 'CAR_STACKING_LIFT' AND "formula" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "product_types" SET "formula" = 'Base price + (Rise − 6) × 500,000' WHERE "code" = 'ESCALATOR' AND "formula" = 'Base price + (rise - 6) * 500,000' AND "deleted_at" IS NULL;
