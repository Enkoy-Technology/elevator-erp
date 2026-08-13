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
    /**
     * Ethiopic-homophone-folded, lowercased shadow of `name` (see
     * src/common/text/ethiopic-normalize.ts). Nullable at the schema level —
     * populated on every write from now on; the migration backfills history.
     * Not intended for display (JSON list/get responses currently return
     * the raw row, so it is technically present there — just not meant to
     * be read); search/duplicate-check filter on this column
     * instead of `name` so ሀ/ሐ/ኀ-style spelling differences still match.
     */
    nameNormalized: text('name_normalized'),
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
    /**
     * When consent to receive transactional SMS was captured — null means no
     * consent on file. ECA Directive 832/2021 requires recorded consent for
     * A2P sends (see the 2018 precedent: Ethio Telecom pulled 47 companies'
     * short codes for sending without it). Server-set only (see
     * UpdateCustomerDto.smsConsentGiven) — never a client-supplied
     * timestamp, so this stays a trustworthy compliance record.
     */
    smsConsentAt: timestamp('sms_consent_at', { withTimezone: true }),
    /**
     * When consent was revoked — null means either never revoked, or never
     * consented in the first place. Revoking no longer nulls smsConsentAt
     * (phase-5 review I10): a single nullable timestamp could only ever
     * answer "is consent active right now", never "did we have consent AT
     * THE TIME we sent" — the actual question an ECA dispute asks. Keeping
     * both timestamps answers it for the most recent consent/revoke pair
     * (see canSmsRecipient in common/sms-consent.ts).
     */
    smsConsentRevokedAt: timestamp('sms_consent_revoked_at', {
      withTimezone: true,
    }),
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
