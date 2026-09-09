import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';
import { users } from './users';

/**
 * Saved SMS wording the office reuses: holiday greetings, announcements,
 * standard reminders. `body` may carry `{{name}}` (the recipient) and
 * `{{company}}` (the tenant), filled in per recipient at send time. A
 * template is a draft, not a record of anything sent — what went out lives
 * in `outbound_messages`, one row per recipient, tagged BROADCAST.
 */
export const messageTemplates = pgTable(
  'message_templates',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    body: text('body').notNull(),
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
      name: 'message_templates_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
