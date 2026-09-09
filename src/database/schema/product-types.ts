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
 * What the company sells and what each starts at. The calculator prices a
 * line as `base + max(0, stops − 10) × perStop + max(0, kg − 630) × perKg`,
 * so a product with both rates at zero is a flat price (escalators, platform
 * lifts). `code` is the stable key quotation lines carry (`product_type`
 * text on document lines); the name is what people read.
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
