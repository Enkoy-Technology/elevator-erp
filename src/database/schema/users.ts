import { sql } from 'drizzle-orm';
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { userRoleEnum } from './enums';
import { tenants } from './tenants';

export const users = pgTable(
  'users',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    /**
     * When consent to receive transactional SMS was captured — null means no
     * consent on file. Technicians are staff, but the same ECA Directive
     * 832/2021 consent rule protects them too (see customers.ts's identical
     * column for the full citation). Server-set only, never a client-supplied
     * timestamp.
     */
    smsConsentAt: timestamp('sms_consent_at', { withTimezone: true }),
    /** Same revoke-without-erasing-history shape as customers.ts's identical column — see its doc comment for the full reasoning (phase-5 review I10). */
    smsConsentRevokedAt: timestamp('sms_consent_revoked_at', {
      withTimezone: true,
    }),
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    refreshTokenHash: text('refresh_token_hash'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
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
    unique('users_tenant_email_unique').on(table.tenantId, table.email),
  ],
);
