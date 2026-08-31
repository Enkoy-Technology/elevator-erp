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

import { customers } from './customers';
import { projectStatusEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const projects = pgTable(
  'projects',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id').notNull(),
    name: text('name').notNull(),
    /** See customers.nameNormalized — same shadow-column convention. */
    nameNormalized: text('name_normalized'),
    code: text('code'),
    status: projectStatusEnum('status').notNull().default('LEAD'),
    siteAddressLine1: text('site_address_line1'),
    siteAddressLine2: text('site_address_line2'),
    siteCity: text('site_city'),
    siteRegion: text('site_region'),
    siteCountry: text('site_country').notNull().default('ET'),
    siteLatitude: numeric('site_latitude', { precision: 10, scale: 7 }),
    siteLongitude: numeric('site_longitude', { precision: 10, scale: 7 }),
    buildingName: text('building_name'),
    quotedAmountEtb: numeric('quoted_amount_etb', { precision: 14, scale: 2 }),
    contractAmountEtb: numeric('contract_amount_etb', {
      precision: 14,
      scale: 2,
    }),
    salesRepUserId: uuid('sales_rep_user_id'),
    technicalLeadUserId: uuid('technical_lead_user_id'),
    projectManagerUserId: uuid('project_manager_user_id'),
    expectedStartDate: timestamp('expected_start_date', { withTimezone: true }),
    expectedEndDate: timestamp('expected_end_date', { withTimezone: true }),
    actualStartDate: timestamp('actual_start_date', { withTimezone: true }),
    actualEndDate: timestamp('actual_end_date', { withTimezone: true }),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set once, when the project first enters CONTRACT — the "won" moment. */
    wonAt: timestamp('won_at', { withTimezone: true }),
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
      name: 'projects_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'projects_sales_rep_fk',
      columns: [table.tenantId, table.salesRepUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'projects_technical_lead_fk',
      columns: [table.tenantId, table.technicalLeadUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'projects_project_manager_fk',
      columns: [table.tenantId, table.projectManagerUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'projects_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
