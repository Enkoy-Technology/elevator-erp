import { sql } from 'drizzle-orm';
import {
  foreignKey,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customerTypeEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const customers = pgTable(
  'customers',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    email: text('email'),
    phone: text('phone'),
    alternatePhone: text('alternate_phone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    region: text('region'),
    country: text('country').notNull().default('ET'),
    buildingName: text('building_name'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    customerType: customerTypeEnum('customer_type')
      .notNull()
      .default('COMMERCIAL'),
    creditLimitEtb: numeric('credit_limit_etb', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    outstandingBalanceEtb: numeric('outstanding_balance_etb', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    paymentTermsDays: numeric('payment_terms_days', { precision: 5, scale: 0 })
      .notNull()
      .default('30'),
    tags: text('tags').array(),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id'),
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
    foreignKey({
      name: 'customers_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
