import { sql } from 'drizzle-orm';
import {
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { messageChannelEnum, messageStatusEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

/**
 * The delivery substrate for every outbound message (SMS today, email
 * later — see FEATURE-notifications.md: the in-app `notifications` table is
 * the inbox staff read in the UI; this table is what actually leaves the
 * building over a third-party channel). Client office power cuts ~39
 * times/month (decisions doc §10) rule out sending inline from a request
 * handler: a send that starts and never finishes because the process died
 * is lost, unretriable and unaudited. Enqueue here instead; the dispatcher
 * (OutboxDispatcherService) claims and sends on a timer.
 *
 * `channel` is generic from day one (SMS | EMAIL) even though only SMS has
 * a producer so far — the point is that adding email later is a new
 * provider, not a new table.
 */
export const outboundMessages = pgTable(
  'outbound_messages',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),

    channel: messageChannelEnum('channel').notNull(),
    // E.164 phone or email address. Phones are normalised at enqueue time
    // (see common/phone.ts) — never stored in whatever shape the caller
    // handed in.
    recipient: text('recipient').notNull(),
    body: text('body').notNull(),

    status: messageStatusEnum('status').notNull().default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text('last_error'),

    // Enqueueing the same logical message twice (a reminder job that runs
    // daily, a retried HTTP request) is a no-op, not a duplicate SMS — see
    // OutboxService.enqueue. The unique index below is what makes that true
    // at the database level, not just in application code.
    dedupeKey: text('dedupe_key').notNull(),

    // Which adapter actually sent it (e.g. 'noop', later a real SMS
    // gateway's name) — useful once there is more than one provider to
    // compare, and it is how the message log makes it obvious that a
    // 'noop'-sent message never really left the building.
    providerMessageId: text('provider_message_id'),
    providerName: text('provider_name'),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    // Nullable: system-generated messages (reminders, dispatcher retries)
    // have no acting user.
    createdByUserId: uuid('created_by_user_id'),

    // Loose context for the future message-log UI ('MAINTENANCE_CONTRACT'
    // + id, etc.) — deliberately not a foreign key: this table must not
    // depend on every module that might one day send a message.
    subjectKind: text('subject_kind'),
    subjectId: uuid('subject_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('outbound_messages_tenant_id_dedupe_key_uk').on(
      table.tenantId,
      table.dedupeKey,
    ),
    foreignKey({
      name: 'outbound_messages_created_by_fk',
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
    }),
  ],
);

export type MessageChannel = (typeof messageChannelEnum.enumValues)[number];
export type MessageStatus = (typeof messageStatusEnum.enumValues)[number];
