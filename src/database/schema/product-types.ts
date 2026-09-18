import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

/**
 * What the company sells and what each starts at. The company's formula
 * (Settings → Pricing, or the product's own `formula`) prices a line from
 * the base price, the stops above `refStops`, the kilograms above
 * `refCapacityKg` and, for escalators, the rise — see src/common/formula.ts.
 * `code` is the stable key quotation lines carry (`product_type` text on
 * document lines); the name is what people read.
 *
 * Seeded with the company's own list the first time a tenant reads it, then
 * theirs to change.
 */
export const productTypes = pgTable(
  'product_types',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    /** UPPER_SNAKE, derived from the name on creation and then fixed. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    basePriceEtb: numeric('base_price_etb', { precision: 14, scale: 2 }).notNull(),
    perStopEtb: numeric('per_stop_etb', { precision: 12, scale: 2 }).notNull().default('0'),
    perKgEtb: numeric('per_kg_etb', { precision: 12, scale: 2 }).notNull().default('0'),
    /** The stops the base price includes (refN in the formula). */
    refStops: integer('ref_stops').notNull().default(10),
    /** The capacity the base price includes (refC in the formula). */
    refCapacityKg: integer('ref_capacity_kg').notNull().default(630),
    /**
     * The smallest rated load this product is sold at, kg; the calculator
     * refuses less. Null: no floor. The client's car lifts, platforms and
     * stacking lifts start at 3,500 kg.
     */
    minCapacityKg: integer('min_capacity_kg'),
    /** This product's own formula; null means the company formula under Settings. */
    formula: text('formula'),
    /** Whether the EN 81 lift geometry block applies (false for escalators). */
    liftGeometry: boolean('lift_geometry').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('product_types_tenant_code_uk').on(table.tenantId, table.code),
  ],
);
