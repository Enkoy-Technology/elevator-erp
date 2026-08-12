import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subscriptionStatusEnum, subscriptionTierEnum } from './enums';

export const tenants = pgTable('tenants', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  taxId: text('tax_id'),
  subscriptionTier: subscriptionTierEnum('subscription_tier')
    .notNull()
    .default('STARTER'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status')
    .notNull()
    .default('TRIAL'),
  /** MM-DD boundary of the Ethiopian fiscal year (see RatesService.fiscalYearFor). */
  fiscalYearStart: text('fiscal_year_start').notNull().default('07-08'),
  /**
   * How many days ahead of a maintenance contract's nextServiceAt the daily
   * reminder cron fires (task-2 brief §2.2) — same "tenant setting" path as
   * fiscalYearStart above.
   */
  maintenanceReminderDays: integer('maintenance_reminder_days')
    .notNull()
    .default(3),
  /**
   * Days relative to an invoice's dueDate the payment-reminder cron fires on
   * (task-2 brief §2.3) — 0 = due date itself, positive = days after. Same
   * "tenant setting" path as fiscalYearStart/maintenanceReminderDays above.
   */
  paymentReminderOffsetDays: integer('payment_reminder_offset_days')
    .array()
    .notNull()
    .default(sql`'{0,7,30}'`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const tenantBranding = pgTable('tenant_branding', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  primaryColorHex: text('primary_color_hex').notNull().default('#1B2A4A'),
  secondaryColorHex: text('secondary_color_hex').notNull().default('#E8B54D'),
  logoUrl: text('logo_url'),
  stampUrl: text('stamp_url'),
  officialAddress: text('official_address'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  /** UI default language: `en` or `am`. */
  defaultLocale: text('default_locale').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
