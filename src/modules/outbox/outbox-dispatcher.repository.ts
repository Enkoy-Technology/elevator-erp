import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, or, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.types';
import { outboundMessages } from '../../database/schema';
import { OUTBOX_ADMIN_DB } from './outbox.constants';
import type { OutboundMessageRecord } from './outbox.repository';

/**
 * MULTI-TENANCY CAVEAT — read before touching this file.
 *
 * Every other repository in this codebase reaches the database through
 * `TenantDbService.withTenant`, which sets `app.tenant_id` as a
 * transaction-local GUC so RLS scopes every query to one tenant. That
 * doesn't work here: `OutboxDispatcherService.dispatch()` runs off a cron,
 * not a request, so there is no authenticated tenant to set — and the whole
 * point of the claim query (task brief 5.2) is to pick up due messages
 * ACROSS every tenant in one pass, which `withTenant`'s single-tenant scope
 * cannot express even if a tenant id were available.
 *
 * The considered exception: this class connects with `DATABASE_ADMIN_URL`
 * (`OUTBOX_ADMIN_DB`, wired only in OutboxModule — see its own doc comment)
 * — the same owner role `db:migrate`/`db:seed` use, which bypasses RLS
 * entirely. That is a deliberate, documented departure from "never bypass
 * RLS in production" (CLAUDE.md), made for the same reason the seeder gets
 * the same exception: this is a system process, not a tenant request. It is
 * safe — it cannot leak one tenant's data into another's — for reasons that
 * are all about what this class is allowed to DO, not about the connection
 * itself (the connection bypasses RLS on every table, not just this one):
 *
 *   1. Every method here touches exactly one table, `outbound_messages`,
 *      and only ever SELECTs/UPDATEs it. There is no DELETE (the table's
 *      own grants don't even allow one) and no query anywhere in this class
 *      accepts a caller-supplied tenant filter or joins across tenants.
 *   2. `claimDue` reads rows that already carry their own `tenant_id` — it
 *      doesn't need to be told which tenant to look at, because it looks at
 *      all of them, and every row it returns is still correctly tagged with
 *      the tenant it belongs to.
 *   3. `markSent`/`markRetry`/`markFailed` never take a tenant id from
 *      anywhere except the message row that was just claimed — they write
 *      back to the exact `(tenant_id, id)` pair that came out of
 *      `claimDue`, so a message can never be attributed to, or resolved
 *      against, the wrong tenant's row.
 *   4. The provider call in between (`OutboxDispatcherService.sendOne`)
 *      sends to `message.recipient`, a value that was already resolved and
 *      normalised for that exact tenant's message at enqueue time
 *      (`OutboxService.enqueue`, running under normal RLS). Nothing about
 *      the admin connection changes what gets sent to whom.
 *   5. `OUTBOX_ADMIN_DB` is provided only inside `OutboxModule` and injected
 *      only into this class — it is not exported, so no controller or other
 *      module can reach for an RLS-bypassing connection by accident.
 *
 * In short: the safety property here is not "RLS still applies" (it
 * doesn't, on this connection) — it's "the only SQL this class is capable
 * of issuing is the four narrow, reviewed statements below, each scoped by
 * a tenant_id that came from the row itself." That is an application-level
 * discipline boundary, which is weaker than a database-enforced one, which
 * is exactly why it gets called out here instead of blended in silently.
 */
@Injectable()
export class OutboxDispatcherRepository {
  constructor(@Inject(OUTBOX_ADMIN_DB) private readonly adminDb: Database) {}

  /**
   * Claims up to `limit` due messages across all tenants: `status =
   * 'QUEUED' AND next_attempt_at <= now()`, oldest due first, `FOR UPDATE
   * SKIP LOCKED` so a second dispatcher instance (or overlapping run) skips
   * whatever this one already has locked instead of blocking on it or
   * double-claiming it — the property proven by the concurrency e2e.
   *
   * Two statements in one transaction rather than a single `UPDATE ...
   * FROM (SELECT ... FOR UPDATE SKIP LOCKED)`: the lock taken by the first
   * SELECT is held for the rest of the transaction, so the second statement
   * (scoped to exactly the rows just locked) can't race anyone — this reads
   * far more plainly through the typed query builder than the equivalent
   * hand-rolled SQL, for a query that runs once a minute over at most 20
   * rows where the extra round trip is free.
   */
  async claimDue(limit: number): Promise<OutboundMessageRecord[]> {
    return this.adminDb.transaction(async (tx) => {
      const due = await tx
        .select({
          tenantId: outboundMessages.tenantId,
          id: outboundMessages.id,
        })
        .from(outboundMessages)
        .where(
          and(
            eq(outboundMessages.status, 'QUEUED'),
            lte(outboundMessages.nextAttemptAt, sql`now()`),
          ),
        )
        .orderBy(outboundMessages.nextAttemptAt)
        .limit(limit)
        .for('update', { skipLocked: true });

      if (due.length === 0) {
        return [];
      }

      return tx
        .update(outboundMessages)
        .set({
          status: 'SENDING',
          attempts: sql`${outboundMessages.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(
          or(
            ...due.map((row) =>
              and(
                eq(outboundMessages.tenantId, row.tenantId),
                eq(outboundMessages.id, row.id),
              ),
            ),
          ),
        )
        .returning();
    });
  }

  async markSent(
    tenantId: string,
    id: string,
    providerMessageId: string,
    providerName: string,
  ): Promise<void> {
    await this.adminDb
      .update(outboundMessages)
      .set({
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId,
        providerName,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outboundMessages.tenantId, tenantId),
          eq(outboundMessages.id, id),
        ),
      );
  }

  async markRetry(
    tenantId: string,
    id: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.adminDb
      .update(outboundMessages)
      .set({ status: 'QUEUED', nextAttemptAt, lastError, updatedAt: new Date() })
      .where(
        and(
          eq(outboundMessages.tenantId, tenantId),
          eq(outboundMessages.id, id),
        ),
      );
  }

  async markFailed(tenantId: string, id: string, lastError: string): Promise<void> {
    await this.adminDb
      .update(outboundMessages)
      .set({ status: 'FAILED', lastError, updatedAt: new Date() })
      .where(
        and(
          eq(outboundMessages.tenantId, tenantId),
          eq(outboundMessages.id, id),
        ),
      );
  }
}
