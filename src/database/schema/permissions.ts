import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users';

export const permissions = pgTable(
  'permissions',
  {
    tenantId: uuid('tenant_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    module: text('module').notNull(),
    action: text('action').notNull(),
    resourceId: uuid('resource_id'),
    grantedBy: uuid('granted_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      name: 'permissions_user_fk',
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
