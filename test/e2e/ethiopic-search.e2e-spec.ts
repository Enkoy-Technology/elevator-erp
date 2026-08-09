/**
 * Task 5 exit gate: create a customer spelled with one Ethiopic homophone,
 * search with a different homophone, find it — proving normalizeEthiopic()
 * on both the write path (CustomersRepository.create) and the search path
 * (CustomersRepository.list) actually line up against real Postgres, and
 * that the 0029 migration's backfill (translate()-based, since the DB can't
 * call the TS normalizer) produced the same result for a row inserted before
 * this feature existed.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (same convention as
 * tenant-isolation.e2e-spec.ts).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  ETHIOPIC_TRANSLATE_FROM,
  ETHIOPIC_TRANSLATE_TO,
  normalizeEthiopic,
} from '../../src/common/text/ethiopic-normalize';
import { CustomersRepository } from '../../src/modules/customers/customers.repository';
import { ProjectsRepository } from '../../src/modules/projects/projects.repository';
import { TenantDbService } from '../../src/database/tenant-db.service';
import * as schema from '../../src/database/schema';

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

describe('Ethiopic homophone search (end to end)', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `ethio-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let repo: CustomersRepository;
  let projectsRepo: ProjectsRepository;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Ethiopic search e2e could not reach Postgres. ' +
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
    appPool = new Pool({ connectionString: APP_URL, max: 2 });

    const result = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status)
       values ($1, $2, 'ACTIVE') returning id`,
      [slug, `Ethiopic Search Test ${slug}`],
    );
    tenantId = result.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role)
       values ($1, $2, 'x', 'Ethiopic Search Test User', 'CEO') returning id`,
      [tenantId, `user@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    repo = new CustomersRepository(tenantDb);
    projectsRepo = new ProjectsRepository(tenantDb);
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from projects where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from users where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  const guarded = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!available) {
        return;
      }
      await fn();
    });
  };

  guarded(
    'a customer written with ሐ is found by a search for its ኀ homophone',
    async () => {
      const created = await repo.create(tenantId, userId, {
        name: 'ሐይሉ Elevator PLC',
      });
      expect(created.name).toBe('ሐይሉ Elevator PLC');
      expect(created.nameNormalized).toBe(normalizeEthiopic('ሐይሉ Elevator PLC'));

      const result = await repo.list(tenantId, { search: 'ኀይሉ' });
      expect(result.items.map((c) => c.id)).toContain(created.id);
      expect(result.items.map((c) => c.name)).toContain('ሐይሉ Elevator PLC');

      // Also the direction the brief's bug report names: search with ኀ,
      // written with ሐ.
      const swapped = await repo.list(tenantId, { search: 'ሐይሉ' });
      expect(swapped.items.map((c) => c.id)).toContain(created.id);
    },
  );

  guarded(
    'a row with a NULL nameNormalized (out-of-band insert, not yet backfilled) still matches a plain lowercase search',
    async () => {
      // Proves the coalesce(nameNormalized, lower(name)) fallback in
      // CustomersRepository.list(): a row that bypassed the application
      // write path — so nameNormalized is still NULL — must not become
      // silently unsearchable by name. Deliberately does NOT run the
      // backfill here (unlike the case below), so nameNormalized stays
      // NULL for the whole test.
      const insertResult = await adminPool.query<{ id: string }>(
        `insert into customers (tenant_id, name) values ($1, $2) returning id`,
        [tenantId, 'Null Normalized Co'],
      );
      const nullId = insertResult.rows[0]!.id;

      const check = await adminPool.query<{ name_normalized: string | null }>(
        `select name_normalized from customers where id = $1`,
        [nullId],
      );
      expect(check.rows[0]!.name_normalized).toBeNull();

      const result = await repo.list(tenantId, { search: 'null normalized' });
      expect(result.items.map((c) => c.id)).toContain(nullId);
    },
  );

  guarded(
    'a row written before this feature existed (raw insert, no nameNormalized) is picked up by the migration backfill',
    async () => {
      // Simulates the pre-migration world: insert with only `name`, exactly
      // like the old application code did, then run the same translate()
      // backfill the 0029 migration ran, and confirm it produces a
      // searchable column.
      const insertResult = await adminPool.query<{ id: string }>(
        `insert into customers (tenant_id, name) values ($1, $2) returning id`,
        [tenantId, 'ሠራተኛ Trading'],
      );
      const legacyId = insertResult.rows[0]!.id;

      // Uses the exported fold table directly (parameterized, not a fourth
      // hand-copied literal) so this test can't itself drift from
      // ethiopic-normalize.ts the way the migration's own literal could —
      // see ethiopic-backfill-sync.spec.ts for the migration-file check.
      await adminPool.query(
        `update customers
           set name_normalized = lower(translate(name, $3, $4))
         where id = $1 and tenant_id = $2 and name_normalized is null`,
        [legacyId, tenantId, ETHIOPIC_TRANSLATE_FROM, ETHIOPIC_TRANSLATE_TO],
      );

      const result = await repo.list(tenantId, { search: 'ሰራተኛ' });
      expect(result.items.map((c) => c.id)).toContain(legacyId);
    },
  );

  guarded(
    'a project written with ሐ is found by a search for its ኀ homophone (REC 6)',
    async () => {
      const customer = await repo.create(tenantId, userId, {
        name: `Project Search Customer ${slug}`,
      });
      const created = await projectsRepo.create(tenantId, userId, {
        customerId: customer.id,
        name: 'ሐይሉ Tower Install',
      });
      expect(created.nameNormalized).toBe(normalizeEthiopic('ሐይሉ Tower Install'));

      const result = await projectsRepo.list(tenantId, { q: 'ኀይሉ' });
      expect(result.items.map((p) => p.id)).toContain(created.id);
    },
  );
});
