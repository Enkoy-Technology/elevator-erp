/**
 * Task 1.3 review fix: proves RatesRepository.rotate() actually serializes
 * two concurrent rotations of the same rate kind. A mocked-transaction unit
 * test cannot catch this — the bug is specific to real Postgres's
 * READ COMMITTED + `SELECT ... FOR UPDATE` semantics: a transaction blocked
 * on a locked row only re-checks THAT row once the blocker commits, it never
 * re-scans for the blocker's newly-inserted row. Without the per-kind
 * advisory lock in rotate(), the loser of the race sees "no open row", skips
 * the validFrom guard, and its insert dies on the partial unique index as a
 * raw, unhandled Postgres error instead of a clean domain error.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { InvalidRateTransitionError } from '../../src/common/exceptions';
import * as schema from '../../src/database/schema';
import type { RateKind } from '../../src/database/schema';
import { RatesRepository } from '../../src/modules/rates/rates.repository';

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

describe('Rate version rotation under concurrency', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  // rate_versions.kind has no DB-level CHECK constraint (Drizzle's
  // `text(..., { enum })` is TS-only), so a synthetic, test-only kind is
  // safe and keeps this test from touching any real statutory rate row.
  const kind = `E2E_TEST_KIND_${randomUUID().slice(0, 8)}` as RateKind;
  const seedValidFrom = '2020-01-01';

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Rate rotation concurrency e2e could not reach Postgres. ' +
        'Run `docker compose up -d && pnpm run db:migrate` first, ' +
        'or set ALLOW_E2E_SKIP=1 to skip deliberately.';
      if (process.env.ALLOW_E2E_SKIP !== '1') {
        throw new Error(message);
      }
      // eslint-disable-next-line no-console
      console.warn(`SKIPPED — ${message}`);
      return;
    }

    adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });
    // max: 4 so two concurrent RatesRepository.rotate() calls each get their
    // own connection — if the pool forced them onto one connection, that
    // alone would serialize the transactions and the test would prove
    // nothing about the advisory lock.
    appPool = new Pool({ connectionString: APP_URL, max: 4 });

    await adminPool.query(
      `insert into rate_versions (kind, valid_from, payload, source)
       values ($1, $2, '{}'::jsonb, 'e2e-setup')`,
      [kind, seedValidFrom],
    );
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from rate_versions where kind = $1`, [kind]);
    await adminPool.end();
    await appPool.end();
  });

  it('serializes two concurrent rotations of the same kind instead of racing the unique index', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const repo = new RatesRepository(db);

    // Both requests use the SAME validFrom. Once correctly serialized, the
    // loser re-reads the open row after the winner committed and finds its
    // own validFrom is no longer strictly after it — a clean 400-class
    // domain error. Before the fix, the loser instead saw "no open row" and
    // its insert died on the unique index with a raw, unhandled error.
    const validFrom = '2026-08-08';
    const results = await Promise.allSettled([
      repo.rotate({ kind, validFrom, payload: { run: 'a' }, source: 'e2e' }),
      repo.rotate({ kind, validFrom, payload: { run: 'b' }, source: 'e2e' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(InvalidRateTransitionError);

    const openRows = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from rate_versions
       where kind = $1 and valid_to is null`,
      [kind],
    );
    expect(Number(openRows.rows[0]!.count)).toBe(1);

    // Chain not corrupted: exactly the seed row (now closed) plus the one
    // winner (still open) — no duplicate/dangling rows from the loser.
    // Cast to text: node-postgres's default DATE parser returns a
    // timezone-shifted JS Date, not the plain 'YYYY-MM-DD' string.
    const allRows = await adminPool.query<{
      valid_from: string;
      valid_to: string | null;
    }>(
      `select valid_from::text as valid_from, valid_to::text as valid_to
       from rate_versions where kind = $1 order by valid_from`,
      [kind],
    );
    expect(allRows.rows).toHaveLength(2);
    expect(allRows.rows[0]).toMatchObject({
      valid_from: seedValidFrom,
      valid_to: '2026-08-07',
    });
    expect(allRows.rows[1]).toMatchObject({
      valid_from: validFrom,
      valid_to: null,
    });
  });
});
