ALTER TABLE "product_types" ADD COLUMN "ref_stops" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_types" ADD COLUMN "ref_capacity_kg" integer DEFAULT 630 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_types" ADD COLUMN "formula" text;--> statement-breakpoint
-- The company's 2026-09-14 price sheet, applied to every tenant that already
-- carries the seeded list. Car lift 12m → 11m; platform lift 3.2m flat →
-- 5.2m with rates; cargo gets its own reference machine; the escalator is
-- priced on its rise; the car stacking lift is new. Hospital/home keep the
-- passenger rates; retired rows are left alone.
UPDATE product_types SET base_price_etb = 11000000.00, per_stop_etb = 300000.00, per_kg_etb = 500.00, ref_stops = 2, ref_capacity_kg = 3000, updated_at = now() WHERE code = 'CAR_LIFT' AND deleted_at IS NULL;--> statement-breakpoint
UPDATE product_types SET base_price_etb = 5200000.00, per_stop_etb = 250000.00, per_kg_etb = 400.00, ref_stops = 2, ref_capacity_kg = 3000, updated_at = now() WHERE code = 'CAR_PLATFORM_LIFT' AND deleted_at IS NULL;--> statement-breakpoint
UPDATE product_types SET name = 'Cargo / goods lift', per_stop_etb = 150000.00, per_kg_etb = 400.00, ref_stops = 2, ref_capacity_kg = 1000, updated_at = now() WHERE code = 'CARGO' AND deleted_at IS NULL;--> statement-breakpoint
UPDATE product_types SET formula = 'Base price + (rise - 6) * 500,000', updated_at = now() WHERE code = 'ESCALATOR' AND deleted_at IS NULL AND formula IS NULL;--> statement-breakpoint
INSERT INTO product_types (tenant_id, code, name, base_price_etb, per_stop_etb, per_kg_etb, ref_stops, ref_capacity_kg, lift_geometry, sort_order)
SELECT t.tenant_id, 'CAR_STACKING_LIFT', 'Car stacking lift', 5200000.00, 500000.00, 400.00, 2, 2000, false, COALESCE(MAX(t.sort_order), 0) + 1
FROM product_types t GROUP BY t.tenant_id
ON CONFLICT (tenant_id, code) DO NOTHING;
