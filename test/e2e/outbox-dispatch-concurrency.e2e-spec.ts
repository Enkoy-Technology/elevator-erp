/**
 * Task 1 (plan 5.2): proves OutboxDispatcherRepository.claimDue's `FOR
 * UPDATE SKIP LOCKED` actually gives two concurrent dispatcher runs
 * DISJOINT sets of messages instead of racing the same rows — the property
 * `SKIP LOCKED` exists for (task-1-brief.md's own words: "must be proven,
 * not assumed"). Without any row locking at all, two transactions under
 * READ COMMITTED would both see the same "top N QUEUED" snapshot and both
 * claim (and later send) the same message — a real duplicate SMS, not a
 * theoretical one. Mirrors payment-allocation-concurrency.e2e-spec.ts's own
 * structure: two genuinely separate connections (own Pool each, sized so
 * both actually get one) racing the same rows via Promise.all.
 *
 * Bypasses NestJS DI entirely and constructs OutboxDispatcherRepository
 * directly against OUTBOX_DISPATCHER_DATABASE_URL — the same least-privilege
 * `outbox_dispatcher` role (migration 0049_outbox_dispatcher_role.sql) the
 * repository connects as in production (see its own doc comment for why:
 * SELECT+UPDATE on outbound_messages only, RLS-gated by the admin_bypass
 * policy rather than superuser identity) — this test exercises that exact
 * path, including the `SET LOCAL app.admin_bypass = 'on'` claimDue relies on
 * to see rows outside any single tenant at all.
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
// Setup (insert tenant + fixture rows) still needs the real owner role;
// only the two competing claimDue() calls below use the dispatcher's own
// least-privilege connection, same split as production.
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

const MESSAGE_COUNT = 10;
// Each dispatcher instance asks for more than half the queue — if claimDue
// ever lost its row locking, both would successfully claim overlapping rows
// instead of splitting the 10 available ones.
const CLAIM_LIMIT = 6;

describe('OutboxDispatcherRepository.claimDue under concurrency', () => {
  let setupPool: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let available = false;

  const slug = `outbox-conc-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let messageIds: string[];

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(DISPATCHER_URL));
    if (!available) {
      const message =
        'Outbox dispatch concurrency e2e could not reach Postgres. ' +
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
    // Two SEPARATE pools (not two connections off one pool) so the two
    // claimDue calls below run on genuinely independent connections, same
    // as two separate API instances (or two overlapping cron ticks) would —
    // both on the dispatcher's own least-privilege role, not the admin one.
    poolA = new Pool({ connectionString: DISPATCHER_URL, max: 2 });
    poolB = new Pool({ connectionString: DISPATCHER_URL, max: 2 });

    const tenantResult = await setupPool.query<{ id: string }>(
      `insert into tenants (slug, name) values ($1, $2) returning id`,
      [slug, `Outbox Concurrency Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const inserted = await setupPool.query<{ id: string }>(
      `insert into outbound_messages (tenant_id, channel, recipient, body, dedupe_key)
       select $1, 'SMS', '+251911234567', 'concurrency test', 'outbox-conc-' || gen_random_uuid()
       from generate_series(1, $2)
       returning id`,
      [tenantId, MESSAGE_COUNT],
    );
    messageIds = inserted.rows.map((row) => row.id);
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await setupPool.query(`delete from outbound_messages where tenant_id = $1`, [tenantId]);
    await setupPool.query(`delete from tenants where id = $1`, [tenantId]);
    await setupPool.end();
    await poolA.end();
    await poolB.end();
  });

  it('two concurrent claimDue(6) calls against a 10-message queue claim disjoint sets covering all 10, none twice', async () => {
    if (!available) {
      return;
    }

    const repoA = new OutboxDispatcherRepository(drizzle(poolA, { schema }));
    const repoB = new OutboxDispatcherRepository(drizzle(poolB, { schema }));

    const [claimedA, claimedB] = await Promise.all([
      repoA.claimDue(CLAIM_LIMIT),
      repoB.claimDue(CLAIM_LIMIT),
    ]);

    const idsA = claimedA.map((m) => m.id);
    const idsB = claimedB.map((m) => m.id);

    // Disjoint: no message claimed by both — the exact property SKIP LOCKED
    // exists for. A regression to no locking at all would show up here as
    // an id present in both arrays.
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);

    // Together, every message got claimed exactly once — nothing left
    // behind, nothing double-counted.
    expect([...idsA, ...idsB].sort()).toEqual([...messageIds].sort());

    // Claim = SENDING + attempts incremented, in the same statement — and
    // exactly once per message, never twice.
    const statusRows = await setupPool.query<{ status: string; attempts: number }>(
      `select status, attempts from outbound_messages where tenant_id = $1`,
      [tenantId],
    );
    expect(statusRows.rows).toHaveLength(MESSAGE_COUNT);
    for (const row of statusRows.rows) {
      expect(row.status).toBe('SENDING');
      expect(row.attempts).toBe(1);
    }
  });
});
