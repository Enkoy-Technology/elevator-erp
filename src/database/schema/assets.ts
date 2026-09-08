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
    /**
     * The machine as the maintenance agreement describes it, one attribute
     * per line ("Brand: Sigma", "Capacity: 630 kg", "Stops: 12 (2B+G+9)").
     * Same shape as proforma_lines.spec_summary, which is where the text
     * usually comes from.
     * ponytail: one text column; split into brand/capacity/speed/stops columns
     * when something needs to filter or sort on them.
     */
    specSummary: text('spec_summary'),
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
