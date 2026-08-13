/**
 * Task 1 (plan 5.4): proves OutboxRepository.enqueue's dedupe swallow
 * actually works against real Postgres, not just a mock.
 *
 * Code review caught a real bug here: the first implementation used a plain
 * INSERT wrapped in try/catch, with the fallback SELECT-for-the-existing-row
 * inside the `catch` block — but Postgres aborts the WHOLE transaction the
 * instant any statement raises (a raw insert's 23505 unique violation
 * included), and every later statement on that same transaction then fails
 * with `25P02 current transaction is aborted` until rollback.
 * `TenantDbService.withTenant` runs the whole `enqueue()` callback in one
 * real transaction, so the fallback SELECT never had a chance to run — the
 * dedupe swallow always threw instead of returning the existing row. A
 * mocked unit test (outbox.repository.spec.ts) didn't catch this because
 * the mock lets `select` succeed unconditionally regardless of the insert's
 * outcome, which doesn't reproduce real Postgres abort semantics. Fixed by
 * switching to `ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`, which never
 * raises, so the transaction stays healthy for the fallback SELECT.
 *
 * This test enqueues the same dedupeKey twice against a live database and
 * asserts the second call returns the SAME row rather than throwing or
 * inserting a duplicate — it would have failed against the original
 * try/catch implementation and passes against the ON CONFLICT DO NOTHING
 * fix.
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

describe('OutboxRepository.enqueue dedupe swallow against real Postgres', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `outbox-dedupe-${randomUUID().slice(0, 8)}`;
  let tenantId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Outbox enqueue dedupe e2e could not reach Postgres. ' +
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

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name) values ($1, $2) returning id`,
      [slug, `Outbox Dedupe Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from outbound_messages where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('enqueueing the same dedupeKey twice returns the same row instead of throwing or inserting twice', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new OutboxRepository(tenantDb);
    const dedupeKey = `reminder:${randomUUID()}`;

    const first = await repo.enqueue(tenantId, {
      channel: 'SMS',
      recipient: '+251949922604',
      body: 'Your payment is due tomorrow.',
      dedupeKey,
    });

    // A second enqueue with the SAME dedupeKey but a DIFFERENT body — if
    // this inserted a new row (or threw) instead of swallowing, the
    // returned row's body would differ from the first, or the call would
    // reject entirely.
    const second = await repo.enqueue(tenantId, {
      channel: 'SMS',
      recipient: '+251949922604',
      body: 'A different body — must never be what gets stored.',
      dedupeKey,
    });

    expect(second.id).toBe(first.id);
    expect(second.body).toBe(first.body);

    const countResult = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from outbound_messages where tenant_id = $1 and dedupe_key = $2`,
      [tenantId, dedupeKey],
    );
    expect(countResult.rows[0]!.count).toBe('1');
  });
});
