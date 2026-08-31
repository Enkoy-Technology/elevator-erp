/**
 * Phase 0 exit gate: proves the last-admin guard survives concurrent
 * demotions. A mocked-repository unit test cannot catch this — the bug is
 * write skew between two real, concurrently-open Postgres transactions
 * (each sees the other admin as still active under READ COMMITTED unless
 * they're serialized by the per-tenant advisory lock in
 * EmployeesRepository.update()).
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { LastAdminError } from '../../src/common/exceptions';
import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';

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

describe('Last-admin guard under concurrency', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `last-admin-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let adminAId: string;
  let adminBId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Last-admin concurrency e2e could not reach Postgres. ' +
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
    // max: 4 so two concurrent EmployeesRepository.update() calls each get
    // their own connection — if the pool forced them onto one connection,
    // that alone would serialize the transactions and the test would prove
    // nothing about the advisory lock.
    appPool = new Pool({ connectionString: APP_URL, max: 4 });

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status)
       values ($1, $2, 'ACTIVE') returning id`,
      [slug, `Last Admin Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const insertAdmin = async (email: string): Promise<string> => {
      const result = await adminPool.query<{ id: string }>(
        `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
         values ($1, $2, 'x', 'Last Admin Test User', 'ADMIN', true) returning id`,
        [tenantId, email],
      );
      return result.rows[0]!.id;
    };
    adminAId = await insertAdmin(`admin-a@${slug}.example.com`);
    adminBId = await insertAdmin(`admin-b@${slug}.example.com`);
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from users where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('leaves at least one active admin when two admins are demoted concurrently', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new EmployeesRepository(tenantDb);

    const results = await Promise.allSettled([
      repo.update(tenantId, adminAId, { isActive: false }),
      repo.update(tenantId, adminBId, { isActive: false }),
    ]);

    // Without the per-tenant advisory lock, both transactions can each see
    // the other admin as still active and both commit — zero admins left.
    // With it, they're serialized: whichever runs second re-reads state
    // after the first committed and finds no other active admin, so it is
    // rejected with LastAdminError.
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(LastAdminError);

    const remaining = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from users
       where tenant_id = $1 and role = 'ADMIN' and is_active = true`,
      [tenantId],
    );
    expect(Number(remaining.rows[0]!.count)).toBeGreaterThanOrEqual(1);
  });
});
