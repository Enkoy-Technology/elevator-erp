import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, lte, or, sql } from 'drizzle-orm';

import type { Database, TenantTransaction } from '../../database/database.types';
import { outboundMessages } from '../../database/schema';
import { OUTBOX_DISPATCHER_DB } from './outbox.constants';
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
 * The considered exception, and it IS narrower than the first version of
 * this file: this class connects as `outbox_dispatcher`
 * (`OUTBOX_ADMIN_DB`/`OUTBOX_DISPATCHER_DATABASE_URL`, wired only in
 * OutboxModule), a dedicated role created by
 * `0049_outbox_dispatcher_role.sql` with exactly `SELECT, UPDATE` on
 * `outbound_messages` and nothing else — not the Postgres superuser
 * `db:migrate`/`db:seed` use, and not a role with default privileges on
 * every table. `outbound_messages` still has `FORCE ROW LEVEL SECURITY`
 * enabled and `outbox_dispatcher` is subject to it like any other
 * non-superuser role: RLS is not bypassed by connection identity here, it
 * is bypassed by the `admin_bypass` policy (`0048_outbound_messages_rls.sql`,
 * retargeted to this role by `0049`), which only matches when the current
 * transaction has explicitly opted in with `SET LOCAL app.admin_bypass =
 * 'on'` — `withAdminBypass` below does that, once, for every method in this
 * class. This is CLAUDE.md's own rule ("admin bypass only via an explicit
 * admin_bypass policy") taken literally, not a superuser workaround dressed
 * up as one — an earlier version of this file used `DATABASE_ADMIN_URL`
 * directly, which technically satisfied "considered and documented" but not
 * "narrow": a superuser connection bypasses RLS on every table in the
 * database, not just this one, which is a materially larger blast radius
 * for a credential that now lives pooled inside the always-on API process
 * instead of a short-lived operator CLI invocation. Caught in review before
 * this ever reached production traffic (nothing calls `OutboxService` yet).
 *
 * Why this still cannot leak one tenant's data into another's, now for two
 * independent reasons instead of one:
 *
 *   1. Database-enforced: `outbox_dispatcher` can SELECT/UPDATE
 *      `outbound_messages` and nothing else — no other table, no INSERT, no
 *      DELETE. Even a fully compromised call site using this connection is
 *      confined to one table's handful of writable columns
 *      (status/attempts/next_attempt_at/last_error/provider_message_id/
 *      provider_name/sent_at), and even then only to rows the admin_bypass
 *      GUC unlocks — normal RLS still applies without it.
 *   2. Application-level (defense in depth, same as before): every method
 *      here only ever writes back to the exact `(tenant_id, id)` pair a row
 *      already carried out of `claimDue` — no caller-supplied tenant
 *      filter, no cross-tenant join. The provider call in between
 *      (`OutboxDispatcherService.sendOne`) sends to `message.recipient`, a
 *      value already resolved and normalised for that tenant's message at
 *      enqueue time (`OutboxService.enqueue`, running under normal RLS via
 *      `withTenant`).
 *
 * `OUTBOX_DISPATCHER_DB` is provided only inside `OutboxModule` and
 * injected only into this class — not exported, so no controller or other
 * module can reach for it by accident.
 */
@Injectable()
export class OutboxDispatcherRepository {
  constructor(
    @Inject(OUTBOX_DISPATCHER_DB) private readonly dispatcherDb: Database,
  ) {}

  /**
   * Runs `fn` inside a transaction with `app.admin_bypass` set for that
   * transaction only (`set_config(..., true)` — is_local, same pattern as
   * `set_tenant_context`) so the `admin_bypass` RLS policy on
   * `outbound_messages` actually matches. Forgetting this is fail-closed,
   * not fail-open: without it, `outbox_dispatcher` matches no policy on
   * this table and every query simply returns zero rows.
   */
  private async withAdminBypass<T>(
    fn: (tx: TenantTransaction) => Promise<T>,
  ): Promise<T> {
    return this.dispatcherDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.admin_bypass', 'on', true)`);
      return fn(tx);
    });
  }

  /**
   * Claims up to `limit` due messages across all tenants: either `status =
   * 'QUEUED' AND next_attempt_at <= now()` (the ordinary case), OR `status =
   * 'SENDING' AND updated_at < now() - 15 minutes` (the stale-claim reclaim,
   * C2). Oldest due first, `FOR UPDATE SKIP LOCKED` so a second dispatcher
   * instance (or overlapping run) skips whatever this one already has
   * locked instead of blocking on it or double-claiming it — the property
   * proven by the concurrency e2e.
   *
   * The stale-claim reclaim exists because claiming commits an entire batch
   * to SENDING up front, before any of them are actually sent — a crash
   * partway through a batch (an ordinary event here: office power cuts
   * ~39x/month) leaves the not-yet-sent remainder stuck in SENDING forever,
   * with no cron predicate that would ever look at them again and no
   * operator action available (the message-log UI only offers Retry on
   * FAILED). Without this, "sent but unrecorded" (C1's stranded-in-SENDING
   * outcome) would ALSO never self-heal. 15 minutes is comfortably longer
   * than one dispatch tick (EVERY_MINUTE) plus the provider's own 10s
   * timeout, so a row still legitimately in flight is never reclaimed out
   * from under itself — see the "fresh SENDING row is NOT reclaimed" spec
   * below.
   *
   * Deliberate tradeoff, spelled out because it's easy to miss: a message
   * that was actually sent successfully but whose markSent write-back also
   * failed (C1) now gets reclaimed and re-sent once, 15 minutes later,
   * instead of never — we accept a rare late duplicate to eliminate a
   * guaranteed silent loss of every not-yet-sent message in a crashed
   * batch. A duplicate SMS after 15 minutes is a customer inconvenience;
   * 14 messages that silently never send, never retry, and never surface
   * as FAILED is exactly what the outbox exists to prevent.
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
    return this.withAdminBypass(async (tx) => {
      const due = await tx
        .select({
          tenantId: outboundMessages.tenantId,
          id: outboundMessages.id,
        })
        .from(outboundMessages)
        .where(
          or(
            and(
              eq(outboundMessages.status, 'QUEUED'),
              lte(outboundMessages.nextAttemptAt, sql`now()`),
            ),
            and(
              eq(outboundMessages.status, 'SENDING'),
              lt(outboundMessages.updatedAt, sql`now() - interval '15 minutes'`),
            ),
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
    await this.withAdminBypass(async (tx) => {
      await tx
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
    });
  }

  async markRetry(
    tenantId: string,
    id: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.withAdminBypass(async (tx) => {
      await tx
        .update(outboundMessages)
        .set({ status: 'QUEUED', nextAttemptAt, lastError, updatedAt: new Date() })
        .where(
          and(
            eq(outboundMessages.tenantId, tenantId),
            eq(outboundMessages.id, id),
          ),
        );
    });
  }

  async markFailed(tenantId: string, id: string, lastError: string): Promise<void> {
    await this.withAdminBypass(async (tx) => {
      await tx
        .update(outboundMessages)
        .set({ status: 'FAILED', lastError, updatedAt: new Date() })
        .where(
          and(
            eq(outboundMessages.tenantId, tenantId),
            eq(outboundMessages.id, id),
          ),
        );
    });
  }
}
