ALTER TABLE "product_types" ADD COLUMN "min_capacity_kg" integer;
--> statement-breakpoint
-- Tenants seeded before this column existed: the client's car products are sold from 3,500 kg.
UPDATE "product_types" SET "min_capacity_kg" = 3500 WHERE "code" IN ('CAR_LIFT', 'CAR_PLATFORM_LIFT', 'CAR_STACKING_LIFT') AND "min_capacity_kg" IS NULL AND "deleted_at" IS NULL;
