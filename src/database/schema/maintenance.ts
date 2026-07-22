import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { customers } from './customers';
import {
  breakdownSeverityEnum,
  breakdownStatusEnum,
  maintenanceContractStatusEnum,
  maintenanceRecurrenceEnum,
} from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const maintenanceContracts = pgTable(
  'maintenance_contracts',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    recurrence: maintenanceRecurrenceEnum('recurrence')
      .notNull()
      .default('MONTHLY'),
    status: maintenanceContractStatusEnum('status').notNull().default('ACTIVE'),
    startDate: date('start_date').notNull(),
    nextServiceAt: date('next_service_at').notNull(),
    lastServiceAt: date('last_service_at'),
    assignedUserId: uuid('assigned_user_id'),
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
      name: 'maintenance_contracts_asset_fk',
      columns: [table.tenantId, table.assetId],
      foreignColumns: [assets.tenantId, assets.id],
    }),
    foreignKey({
      name: 'maintenance_contracts_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'maintenance_contracts_assigned_fk',
      columns: [table.tenantId, table.assignedUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'maintenance_contracts_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export const serviceVisits = pgTable(
  'service_visits',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    contractId: uuid('contract_id').notNull(),
    visitedAt: timestamp('visited_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    performedByUserId: uuid('performed_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'service_visits_contract_fk',
      columns: [table.tenantId, table.contractId],
      foreignColumns: [maintenanceContracts.tenantId, maintenanceContracts.id],
    }),
    foreignKey({
      name: 'service_visits_performed_by_fk',
      columns: [table.tenantId, table.performedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export const breakdowns = pgTable(
  'breakdowns',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    severity: breakdownSeverityEnum('severity').notNull().default('MEDIUM'),
    status: breakdownStatusEnum('status').notNull().default('OPEN'),
    assignedUserId: uuid('assigned_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
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
      name: 'breakdowns_asset_fk',
      columns: [table.tenantId, table.assetId],
      foreignColumns: [assets.tenantId, assets.id],
    }),
    foreignKey({
      name: 'breakdowns_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'breakdowns_assigned_fk',
      columns: [table.tenantId, table.assignedUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'breakdowns_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
