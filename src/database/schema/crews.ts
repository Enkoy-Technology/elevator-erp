import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crewTypeEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const crews = pgTable(
  'crews',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    crewType: crewTypeEnum('crew_type').notNull().default('INSTALLATION'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const crewMembers = pgTable(
  'crew_members',
  {
    tenantId: uuid('tenant_id').notNull(),
    crewId: uuid('crew_id').notNull(),
    userId: uuid('user_id').notNull(),
    isLead: boolean('is_lead').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.crewId, table.userId] }),
    foreignKey({
      name: 'crew_members_crew_fk',
      columns: [table.tenantId, table.crewId],
      foreignColumns: [crews.tenantId, crews.id],
    }),
    foreignKey({
      name: 'crew_members_user_fk',
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);
