/**
 * Task 3 (plan 5.4, §3.3): proves the message-log's two new repository
 * methods against REAL Postgres, not just the mocked unit tests
 * (outbox.repository.spec.ts) — specifically the two properties a mock
 * can't prove: RLS actually scopes `list()` to one tenant (CLAUDE.md:
 * "RLS policies enforce tenant isolation at the DB level... must be proven,
 * not assumed" — same standard task-1's own dispatch-concurrency e2e test
 * set), and `app_user` actually holds the UPDATE grant `retry()` needs
 * (task-1's migration 0048 grants SELECT/INSERT/UPDATE, no DELETE).
 *
 * Same direct-repository-against-real-Postgres shape as
 * outbox-enqueue-dedupe.e2e-spec.ts — no HTTP/JWT layer needed to prove
 * either property.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { OutboxRepository } from '../../src/modules/outbox/outbox.repository';

// The client's own test handset — the only phone number allowed in this
// codebase's fixtures/specs/docs (task-3 brief §3.0 SAFETY). Rows are told
// apart by body/dedupeKey, not by recipient, so one shared number is fine.
const TEST_PHONE = '+251949922604';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://postgres:postgres@localhost:5434/elevator_erp';
const APP_URL =
  process.env.DATABASE_URL ??
  'postgresql://app_user:app_password@localhost:5434/elevator_erp';

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

describe('OutboxRepository message log (list/retry) against real Postgres', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slugA = `outbox-log-a-${randomUUID().slice(0, 8)}`;
  const slugB = `outbox-log-b-${randomUUID().slice(0, 8)}`;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Outbox message-log e2e could not reach Postgres. ' +
        'Run `docker compose up -d && pnpm run db:migrate` first, ' +
        'or set ALLOW_E2E_SKIP=1 to skip deliberately.';
      if (process.env.ALLOW_E2E_SKIP !== '1') {
        throw new Error(message);
      }
      // eslint-disable-next-line no-console
      console.warn(`SKIPPED — ${message}`);
      return;
    }

    adminPool = new Pool({ connectionString: ADMIN_URL, max: 1 });
    appPool = new Pool({ connectionString: APP_URL, max: 1 });

    const [rowA, rowB] = await Promise.all([
      adminPool.query<{ id: string }>(
        `insert into tenants (slug, name) values ($1, $2) returning id`,
        [slugA, `Outbox Log Test A ${slugA}`],
      ),
      adminPool.query<{ id: string }>(
        `insert into tenants (slug, name) values ($1, $2) returning id`,
        [slugB, `Outbox Log Test B ${slugB}`],
      ),
    ]);
    tenantA = rowA.rows[0]!.id;
    tenantB = rowB.rows[0]!.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from outbound_messages where tenant_id in ($1, $2)`, [
      tenantA,
      tenantB,
    ]);
    await adminPool.query(`delete from tenants where id in ($1, $2)`, [tenantA, tenantB]);
    await adminPool.end();
    await appPool.end();
  });

  it("list() only ever returns the calling tenant's own rows, even though both tenants have messages", async () => {
    if (!available) {
      return;
    }
    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new OutboxRepository(tenantDb);

    await repo.enqueue(tenantA, {
      channel: 'SMS',
      recipient: TEST_PHONE,
      body: 'Tenant A message',
      dedupeKey: `log-a-${randomUUID()}`,
    });
    await repo.enqueue(tenantB, {
      channel: 'SMS',
      recipient: TEST_PHONE,
      body: 'Tenant B message',
      dedupeKey: `log-b-${randomUUID()}`,
    });

    const resultA = await repo.list(tenantA, {}, '1', '100');
    const resultB = await repo.list(tenantB, {}, '1', '100');

    expect(resultA.items.every((m) => m.tenantId === tenantA)).toBe(true);
    expect(resultA.items.some((m) => m.body === 'Tenant B message')).toBe(false);
    expect(resultB.items.every((m) => m.tenantId === tenantB)).toBe(true);
    expect(resultB.items.some((m) => m.body === 'Tenant A message')).toBe(false);
  });

  it('retry() flips a FAILED message to QUEUED, due immediately, WITHOUT resetting attempts — real UPDATE grant proof', async () => {
    if (!available) {
      return;
    }
    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new OutboxRepository(tenantDb);

    const enqueued = await repo.enqueue(tenantA, {
      channel: 'SMS',
      recipient: TEST_PHONE,
      body: 'Will fail then be retried',
      dedupeKey: `log-retry-${randomUUID()}`,
    });
    // Drive it to FAILED with a known attempts count directly (the
    // dispatcher's own state machine is task-1's concern, already proven
    // elsewhere — this test only needs a FAILED row to retry).
    await adminPool.query(
      `update outbound_messages set status = 'FAILED', attempts = 4, last_error = 'simulated failure' where tenant_id = $1 and id = $2`,
      [tenantA, enqueued.id],
    );

    const retried = await repo.retry(tenantA, enqueued.id);

    expect(retried.status).toBe('QUEUED');
    expect(retried.attempts).toBe(4); // never reset — would hide a chronic failure
    expect(retried.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('retry() rejects a non-FAILED message with a 409-shaped WorkflowTransitionError', async () => {
    if (!available) {
      return;
    }
    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new OutboxRepository(tenantDb);

    const enqueued = await repo.enqueue(tenantA, {
      channel: 'SMS',
      recipient: TEST_PHONE,
      body: 'Still queued',
      dedupeKey: `log-notfailed-${randomUUID()}`,
    });

    await expect(repo.retry(tenantA, enqueued.id)).rejects.toThrow(/QUEUED, not FAILED/);
  });
});
