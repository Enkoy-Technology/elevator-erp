import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
  stripeCustomerId: text('stripe_customer_id'),
  maxUsers: integer('max_users').notNull().default(10),
  maxProjects: integer('max_projects').notNull().default(25),
  storageQuotaMb: integer('storage_quota_mb').notNull().default(1024),
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
  letterheadUrl: text('letterhead_url'),
  stampUrl: text('stamp_url'),
  sealUrl: text('seal_url'),
  officialAddress: text('official_address'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  bankDetails: jsonb('bank_details'),
  pdfHeaderHtml: text('pdf_header_html'),
  pdfFooterHtml: text('pdf_footer_html'),
  /** UI default language: `en` or `am`. */
  defaultLocale: text('default_locale').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
