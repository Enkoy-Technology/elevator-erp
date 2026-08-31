import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

/**
 * Backs the `Idempotency-Key` header on the mutating finance endpoints
 * (`common/idempotency/idempotency.interceptor.ts` — see its doc comment
 * for the full replay/conflict/in-progress protocol). A row is claimed
 * (INSERT, or a reclaim UPDATE — see `IdempotencyKeysRepository.claim`)
 * before the protected handler runs, and completed (UPDATE, filling
 * `responseStatus`/`responseBody`) after it succeeds.
 *
 * Unlike the money ledgers this table sits in front of, it is deliberately
 * NOT append-only: see the RLS migration's own comment for why UPDATE stays
 * granted while DELETE is revoked.
 *
 * `responseStatus`/`responseBody` are nullable: NULL means "claimed, handler
 * still running" — the state `IdempotencyKeysRepository.claim`'s
 * stale-reclaim branch exists to recover from a crashed claimant (this
 * client's site loses power ~39 times a month; a claim that never completes
 * is not hypothetical).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id')
      .notNull()
      .default(sql`gen_random_uuid()`),

    // The client-supplied Idempotency-Key header value, verbatim.
    key: text('key').notNull(),

    // `${ControllerClass}#${handlerName}` — identifies which endpoint this
    // claim belongs to. Deliberately NOT part of the unique constraint below
    // (that is (tenant_id, key) only, per the task brief) — reusing a key
    // across two different endpoints is instead caught as a fingerprint
    // mismatch (409 conflict): `fingerprint` hashes endpoint + body
    // together, see request-fingerprint.ts.
    endpoint: text('endpoint').notNull(),
    fingerprint: text('fingerprint').notNull(),

    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique('idempotency_keys_tenant_id_key_uk').on(table.tenantId, table.key),
  ],
);
