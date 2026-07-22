import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import { tenants } from './tenants';

/**
 * Fuzzy-match index for duplicate detection (TAD §3.4).
 * Synced on customer create/update; weekly rebuild cron is deferred.
 */
export const customerFingerprints = pgTable(
  'customer_fingerprints',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    nameSoundex: text('name_soundex').notNull(),
    phoneE164: text('phone_e164'),
    alternatePhoneE164: text('alternate_phone_e164'),
    buildingNormalized: text('building_normalized'),
    geohash: text('geohash'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.customerId] }),
    foreignKey({
      name: 'customer_fingerprints_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
  ],
);
