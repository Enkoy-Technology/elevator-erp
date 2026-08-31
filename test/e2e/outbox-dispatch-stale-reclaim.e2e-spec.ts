/**
 * C2 (blocker): claimDue commits an entire claimed batch to SENDING before
 * any message in it is actually sent. Only QUEUED rows were ever reclaimed,
 * so a crash between "claimed" and "sent" (an ordinary event at this
 * client's site — office power cuts ~39x/month, task-3 brief) stranded the
 * unsent remainder of the batch in SENDING forever: never retried, never
 * marked FAILED, no operator action available (the message-log UI only
 * offers Retry on FAILED). This proves the fix directly against a real
 * database: a SENDING row older than 15 minutes IS reclaimed by a later
 * claimDue call, and a SENDING row that is still fresh is NOT — the
 * predicate this test exists to prove can't be faked with mocks (it's a
 * `now() - interval` comparison Postgres evaluates, not application code).
 *
 * Same connection-split pattern as outbox-dispatch-concurrency.e2e-spec.ts:
 * setup via the owner role, the claimDue calls under test via the
 * dispatcher's own least-privilege `outbox_dispatcher` role.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../src/database/schema';
import { OutboxDispatcherRepository } from '../../src/modules/outbox/outbox-dispatcher.repository';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://postgres:postgres@localhost:5434/elevator_erp';
const DISPATCHER_URL =
  process.env.OUTBOX_DISPATCHER_DATABASE_URL ??
  'postgresql://outbox_dispatcher:dispatcher_password@localhost:5434/elevator_erp';

const canConnect = async (url: string): Promise<boolean> => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
};

describe('OutboxDispatcherRepository.claimDue — stale SENDING reclaim (C2)', () => {
  let setupPool: Pool;
  let dispatcherPool: Pool;
  let available = false;

  const slug = `outbox-stale-${randomUUID().slice(0, 8)}`;
  let tenantId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(DISPATCHER_URL));
    if (!available) {
      const message =
        'Outbox stale-reclaim e2e could not reach Postgres. ' +
        'Run `docker compose up -d && pnpm run db:migrate` first, ' +
        'or set ALLOW_E2E_SKIP=1 to skip deliberately.';
      if (process.env.ALLOW_E2E_SKIP !== '1') {
        throw new Error(message);
      }
      // eslint-disable-next-line no-console
      console.warn(`SKIPPED — ${message}`);
      return;
    }

    setupPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
    dispatcherPool = new Pool({ connectionString: DISPATCHER_URL, max: 2 });

    const tenantResult = await setupPool.query<{ id: string }>(
      `insert into tenants (slug, name) values ($1, $2) returning id`,
      [slug, `Outbox Stale Reclaim Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await setupPool.query(`delete from outbound_messages where tenant_id = $1`, [tenantId]);
    await setupPool.query(`delete from tenants where id = $1`, [tenantId]);
    await setupPool.end();
    await dispatcherPool.end();
  });

  it('a SENDING row backdated more than 15 minutes IS reclaimed; a fresh SENDING row is NOT', async () => {
    if (!available) {
      return;
    }

    const staleInsert = await setupPool.query<{ id: string }>(
      `insert into outbound_messages
         (tenant_id, channel, recipient, body, dedupe_key, status, attempts, updated_at)
       values ($1, 'SMS', '+251949922604', 'stale batch victim', $2, 'SENDING', 1, now() - interval '16 minutes')
       returning id`,
      [tenantId, `outbox-stale-${randomUUID()}`],
    );
    const staleId = staleInsert.rows[0]!.id;

    const freshInsert = await setupPool.query<{ id: string }>(
      `insert into outbound_messages
         (tenant_id, channel, recipient, body, dedupe_key, status, attempts, updated_at)
       values ($1, 'SMS', '+251949922604', 'still in flight', $2, 'SENDING', 1, now() - interval '2 minutes')
       returning id`,
      [tenantId, `outbox-fresh-${randomUUID()}`],
    );
    const freshId = freshInsert.rows[0]!.id;

    const repo = new OutboxDispatcherRepository(drizzle(dispatcherPool, { schema }));
    const claimed = await repo.claimDue(20);
    const claimedIds = claimed.map((m) => m.id);

    expect(claimedIds).toContain(staleId);
    expect(claimedIds).not.toContain(freshId);

    // Reclaiming re-enters the same "SENDING, attempts incremented" state a
    // fresh claim produces — claimDue treats it as one more dispatch
    // attempt, same as any other claimed row.
    const reclaimedRow = claimed.find((m) => m.id === staleId);
    expect(reclaimedRow?.status).toBe('SENDING');
    expect(reclaimedRow?.attempts).toBe(2);

    const freshRow = await setupPool.query<{ status: string; attempts: number }>(
      `select status, attempts from outbound_messages where tenant_id = $1 and id = $2`,
      [tenantId, freshId],
    );
    expect(freshRow.rows[0]?.status).toBe('SENDING');
    expect(freshRow.rows[0]?.attempts).toBe(1);
  });
});
