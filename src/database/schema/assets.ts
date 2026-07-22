import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import { assetCategoryEnum, assetStatusEnum } from './enums';
import { projects } from './projects';
import { tenants } from './tenants';
import { users } from './users';

export const assets = pgTable(
  'assets',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id').notNull(),
    projectId: uuid('project_id'),
    category: assetCategoryEnum('category').notNull(),
    name: text('name').notNull(),
    buildingName: text('building_name'),
    serialNumber: text('serial_number'),
    locationNotes: text('location_notes'),
    status: assetStatusEnum('status').notNull().default('ACTIVE'),
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
      name: 'assets_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'assets_project_fk',
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: 'assets_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
