import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { notificationTypeEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    type: notificationTypeEnum('type').notNull().default('GENERAL'),
    title: text('title').notNull(),
    body: text('body'),
    linkPath: text('link_path'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'notifications_user_fk',
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      name: 'notifications_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
