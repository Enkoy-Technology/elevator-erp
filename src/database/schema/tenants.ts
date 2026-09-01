import { sql } from 'drizzle-orm';
import {
  integer,
  numeric,
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
  /**
   * Last-run result of the nightly customer-balance reconciliation (task-2
   * brief §2.5) — the "somewhere an admin can see it" surface: read back
   * through GET /settings, written by BalanceReconciliationService after
   * every run. Both null until the job has ever run once.
   */
  balanceReconciliationLastRunAt: timestamp(
    'balance_reconciliation_last_run_at',
    { withTimezone: true },
  ),
  balanceReconciliationMismatchCount: integer(
    'balance_reconciliation_mismatch_count',
  ),
  /**
   * Last-run result of each daily reminder cron's consent gate (task-3
   * brief §3.4: "12 reminders not sent — no consent on file" must be
   * visible, not silent) — same "somewhere an admin can see it" surface as
   * balanceReconciliation* above, one pair per cron since they run
   * independently (6am/7am) and each only knows its own tally. Both null
   * until that cron has ever run once. Written by
   * MaintenanceReminderService/PaymentReminderService after every run, read
   * back through GET /settings.
   */
  maintenanceReminderConsentSkippedLastRunAt: timestamp(
    'maintenance_reminder_consent_skipped_last_run_at',
    { withTimezone: true },
  ),
  maintenanceReminderConsentSkippedCount: integer(
    'maintenance_reminder_consent_skipped_count',
  ),
  paymentReminderConsentSkippedLastRunAt: timestamp(
    'payment_reminder_consent_skipped_last_run_at',
    { withTimezone: true },
  ),
  paymentReminderConsentSkippedCount: integer(
    'payment_reminder_consent_skipped_count',
  ),
  /**
   * Same "somewhere an admin can see it" surface as *ConsentSkippedCount
   * above, for the OTHER reason a reminder silently never arrives (phase-5
   * review I4): a stored phone number that fails normalizeEthiopianPhone's
   * format check. Root-caused by validating phone format where it's
   * WRITTEN (customer/employee DTOs), so this only ever counts numbers that
   * were already bad before that validation shipped — shares the
   * corresponding *ConsentSkippedLastRunAt timestamp above, since both
   * counts come from the same cron run.
   */
  maintenanceReminderInvalidPhoneSkippedCount: integer(
    'maintenance_reminder_invalid_phone_skipped_count',
  ),
  paymentReminderInvalidPhoneSkippedCount: integer(
    'payment_reminder_invalid_phone_skipped_count',
  ),
  /**
   * Discount above which a quotation needs explicit sign-off
   * (`quotations.discountApprovedByUserId`). NULL — the default — means no
   * approval is required at all: this client negotiates every deal and does
   * not want the extra step on the sales manager. Same "tenant setting"
   * path as fiscalYearStart above.
   */
  discountApprovalThresholdPercent: numeric(
    'discount_approval_threshold_percent',
    { precision: 5, scale: 2 },
  ),
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
  /** Printed under the company name on every branded document. The client's
   * own proposal requires "STAR OF ELEVATION" on all generated documents;
   * the PDF and docx layouts already omit the line when this is empty. */
  slogan: text('slogan'),
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
