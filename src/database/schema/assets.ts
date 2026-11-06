import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers } from './customers';
import {
  assetCategoryEnum,
  assetChecklistMarkEnum,
  assetEventKindEnum,
  assetStatusEnum,
} from './enums';
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
    /** Who it is sold to. Blank means the lift is still in stock. */
    customerId: uuid('customer_id'),
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

/**
 * One line of the packing list, copied onto a lift when it is registered, so a
 * later change to the fixed list leaves registered lifts alone. Quantity is
 * text because the factory writes things like "4M=12, 2.5M=2".
 */
export const assetChecklistItems = pgTable(
  'asset_checklist_items',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id').notNull(),
    caseNo: integer('case_no').notNull(),
    boxName: text('box_name').notNull(),
    itemNo: text('item_no').notNull(),
    name: text('name').notNull(),
    factoryName: text('factory_name').notNull(),
    specification: text('specification'),
    unit: text('unit'),
    quantity: text('quantity'),
    position: integer('position').notNull(),
    /** OK is ticked as arrived, MISSING is unticked. Every part starts OK. */
    mark: assetChecklistMarkEnum('mark').notNull(),
    note: text('note'),
    checkedByUserId: uuid('checked_by_user_id'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index('asset_checklist_items_tenant_asset_idx').on(
      table.tenantId,
      table.assetId,
      table.position,
    ),
    foreignKey({
      name: 'asset_checklist_items_asset_fk',
      columns: [table.tenantId, table.assetId],
      foreignColumns: [assets.tenantId, assets.id],
    }),
    foreignKey({
      name: 'asset_checklist_items_checked_by_fk',
      columns: [table.tenantId, table.checkedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

/** Who moved a lift or sold it, and when. Rows are only ever added. */
export const assetEvents = pgTable(
  'asset_events',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id').notNull(),
    kind: assetEventKindEnum('kind').notNull(),
    fromStatus: assetStatusEnum('from_status'),
    toStatus: assetStatusEnum('to_status'),
    /** The customer after a SOLD_TO event; blank means sold-to was cleared. */
    customerId: uuid('customer_id'),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index('asset_events_tenant_asset_idx').on(
      table.tenantId,
      table.assetId,
      table.createdAt,
    ),
    foreignKey({
      name: 'asset_events_asset_fk',
      columns: [table.tenantId, table.assetId],
      foreignColumns: [assets.tenantId, assets.id],
    }),
    foreignKey({
      name: 'asset_events_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: 'asset_events_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type AssetStatus = (typeof assetStatusEnum.enumValues)[number];
export type AssetChecklistMark = (typeof assetChecklistMarkEnum.enumValues)[number];
