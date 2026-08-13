import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { outboundMessages } from '../../database/schema';
import type { MessageChannel, MessageStatus } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type OutboundMessageRecord = typeof outboundMessages.$inferSelect;

export interface OutboxListFilter {
  status?: MessageStatus;
  channel?: MessageChannel;
  /** Calendar date (YYYY-MM-DD, UTC) — inclusive lower bound on createdAt.
   * Browsing convenience only, no fiscal significance (unlike payments'
   * receivedAt filter) — plain UTC day boundaries are precise enough here,
   * not worth this module's own copy of PaymentsRepository's
   * business-timezone businessDayStart/End. */
  from?: string;
  /** Calendar date (YYYY-MM-DD, UTC) — inclusive upper bound on createdAt. */
  to?: string;
}

const utcDayStart = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);
/** Exclusive upper bound for a `to` filter — the instant the NEXT UTC day begins. */
const utcDayEnd = (isoDate: string): Date =>
  new Date(utcDayStart(isoDate).getTime() + 86_400_000);

export interface EnqueueMessageValues {
  channel: MessageChannel;
  recipient: string;
  body: string;
  dedupeKey: string;
  subjectKind?: string;
  subjectId?: string;
  createdByUserId?: string;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Inserts a new outbound message, or — if `dedupeKey` was already used by
   * this tenant — returns the existing row instead of erroring. That swallow
   * IS the idempotency story (task brief 5.4): a reminder job that runs
   * every day, or a caller retrying an HTTP request that already enqueued,
   * must produce one message, not a fresh SMS each time.
   *
   * Uses `ON CONFLICT (tenant_id, dedupe_key) DO NOTHING` rather than a
   * plain insert wrapped in try/catch: Postgres aborts the whole
   * transaction the instant any statement raises (here, a raw insert's
   * 23505 unique violation), and every later statement on that same
   * transaction — including a fallback SELECT for the existing row — then
   * fails with `25P02 current transaction is aborted` until rollback.
   * `TenantDbService.withTenant` runs this in one real transaction, so a
   * try/catch-and-select-in-the-catch-block never actually reaches the
   * SELECT (caught in code review — a mocked unit test doesn't reproduce
   * Postgres's real abort semantics, so this only surfaced against a live
   * database). `ON CONFLICT DO NOTHING` never raises, so the transaction
   * stays healthy and the fallback SELECT below runs normally.
   */
  async enqueue(
    tenantId: string,
    values: EnqueueMessageValues,
  ): Promise<OutboundMessageRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [inserted] = await tx
        .insert(outboundMessages)
        .values({ tenantId, ...values })
        .onConflictDoNothing({
          target: [outboundMessages.tenantId, outboundMessages.dedupeKey],
        })
        .returning();

      if (inserted) {
        return inserted;
      }

      const [existing] = await tx
        .select()
        .from(outboundMessages)
        .where(
          and(
            eq(outboundMessages.tenantId, tenantId),
            eq(outboundMessages.dedupeKey, values.dedupeKey),
          ),
        )
        .limit(1);
      if (!existing) {
        // The conflict named this (tenantId, dedupeKey) pair; it existing a
        // moment ago and not now would mean a concurrent delete, which this
        // table's grants never allow (no DELETE).
        throw new Error(
          `Outbox enqueue conflicted on dedupeKey "${values.dedupeKey}" but no existing row was found`,
        );
      }
      return existing;
    });
  }

  private buildFilters(filter: OutboxListFilter) {
    const filters = [];
    if (filter.status) {
      filters.push(eq(outboundMessages.status, filter.status));
    }
    if (filter.channel) {
      filters.push(eq(outboundMessages.channel, filter.channel));
    }
    if (filter.from) {
      filters.push(gte(outboundMessages.createdAt, utcDayStart(filter.from)));
    }
    if (filter.to) {
      filters.push(lt(outboundMessages.createdAt, utcDayEnd(filter.to)));
    }
    return and(...filters);
  }

  /**
   * The message-log UI (task-3 brief §3.3) — newest first, same
   * status/channel/date-range filters `streamAll` below honors for the
   * CSV/XLSX export.
   */
  async list(
    tenantId: string,
    filter: OutboxListFilter,
    page?: string,
    pageSize?: string,
  ): Promise<PaginatedResult<OutboundMessageRecord>> {
    const normalized = normalizePageQuery(page, pageSize);
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = this.buildFilters(filter);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(outboundMessages)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(outboundMessages)
        .where(where)
        .orderBy(desc(outboundMessages.createdAt))
        .limit(normalized.pageSize)
        .offset(normalized.offset);
      return toPaginatedResult(items, total, normalized.page, normalized.pageSize);
    });
  }

  /**
   * Streams every message matching the same filters `list()` honors, for
   * the `?format=csv|xlsx` bulk export — same batching shape as
   * CustomersRepository/EmployeesRepository's own `streamAll`.
   */
  async *streamAll(
    tenantId: string,
    filter: OutboxListFilter,
  ): AsyncGenerator<OutboundMessageRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) =>
        tx
          .select()
          .from(outboundMessages)
          .where(this.buildFilters(filter))
          .orderBy(desc(outboundMessages.createdAt), outboundMessages.id)
          .limit(BATCH_SIZE)
          .offset(offset),
      );
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  /**
   * Operator retry (task-3 brief §3.3): FAILED -> QUEUED, due immediately,
   * WITHOUT resetting `attempts` — a reset would hide a chronic failure
   * behind a fresh-looking attempt count. Only matches a row currently
   * FAILED (guards against retrying a message mid-flight or already sent);
   * no match means either the id doesn't exist or it isn't FAILED right
   * now, and this can't tell those apart from one UPDATE, so it re-reads to
   * give the caller an accurate 404 either way.
   */
  async retry(tenantId: string, id: string): Promise<OutboundMessageRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [updated] = await tx
        .update(outboundMessages)
        .set({ status: 'QUEUED', nextAttemptAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(outboundMessages.tenantId, tenantId),
            eq(outboundMessages.id, id),
            eq(outboundMessages.status, 'FAILED'),
          ),
        )
        .returning();
      if (updated) {
        return updated;
      }

      const [existing] = await tx
        .select()
        .from(outboundMessages)
        .where(and(eq(outboundMessages.tenantId, tenantId), eq(outboundMessages.id, id)))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Message not found');
      }
      throw new WorkflowTransitionError(
        `Message is ${existing.status}, not FAILED — only a FAILED message can be retried`,
      );
    });
  }
}
