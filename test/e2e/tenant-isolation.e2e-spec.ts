/**
 * Phase 0 exit gate: proves tenant A cannot read tenant B's rows —
 * both through the app-layer TenantDbService and with RLS as the SOLE guard
 * (raw queries with no WHERE clause, connected as the non-owner app role).
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable.
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

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

describe('Tenant isolation (RLS)', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slugA = `iso-a-${randomUUID().slice(0, 8)}`;
  const slugB = `iso-b-${randomUUID().slice(0, 8)}`;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      // These are the only tests that verify tenant isolation. Passing them
      // without a database would report the platform's core security property
      // as proven when nothing ran, so an unreachable DB is a failure unless
      // the caller opts out explicitly.
      const message =
        'Tenant isolation e2e could not reach Postgres. ' +
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

    const insertTenant = async (slug: string): Promise<string> => {
      const result = await adminPool.query<{ id: string }>(
        `insert into tenants (slug, name, subscription_status)
         values ($1, $2, 'ACTIVE') returning id`,
        [slug, `Isolation Test ${slug}`],
      );
      return result.rows[0]!.id;
    };

    tenantA = await insertTenant(slugA);
    tenantB = await insertTenant(slugB);

    for (const [tenantId, email] of [
      [tenantA, `user@${slugA}.example.com`],
      [tenantB, `user@${slugB}.example.com`],
    ] as const) {
      await adminPool.query(
        `insert into users (tenant_id, email, password_hash, full_name, role)
         values ($1, $2, 'x', 'Isolation Test User', 'CEO')`,
        [tenantId, email],
      );
    }
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(
      `delete from users where tenant_id = any($1::uuid[])`,
      [[tenantA, tenantB]],
    );
    await adminPool.query(`delete from tenants where id = any($1::uuid[])`, [
      [tenantA, tenantB],
    ]);
    await adminPool.end();
    await appPool.end();
  });

  // Jest evaluates `it` bodies at definition time, so wrap in a runtime check.
  const guarded = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!available) {
        return;
      }
      await fn();
    });
  };

  guarded('RLS alone blocks reads with no tenant context', async () => {
    // No set_tenant_context, no WHERE clause — app role must see nothing.
    const result = await appPool.query('select * from users');
    expect(result.rows).toHaveLength(0);
  });

  guarded('RLS alone scopes unfiltered reads to the context tenant', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select set_tenant_context($1::uuid)', [tenantA]);
      const result = await client.query<{ tenant_id: string }>(
        'select tenant_id from users',
      );
      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.tenant_id).toBe(tenantA);
      }
      await client.query('commit');
    } finally {
      client.release();
    }
  });

  guarded('RLS blocks writing a row for another tenant', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select set_tenant_context($1::uuid)', [tenantA]);
      await expect(
        client.query(
          `insert into users (tenant_id, email, password_hash, full_name, role)
           values ($1, 'intruder@evil.example.com', 'x', 'Intruder', 'CEO')`,
          [tenantB],
        ),
      ).rejects.toThrow(/row-level security/);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  guarded('tenant context does not leak across pooled connections', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select set_tenant_context($1::uuid)', [tenantA]);
      await client.query('commit');
      // Same physical connection, new transaction: context must be gone.
      const result = await client.query('select * from users');
      expect(result.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  guarded('app layer: TenantDbService scopes queries to its tenant', async () => {
    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);

    const rowsA = await tenantDb.withTenant(tenantA, async (tx) =>
      tx.select().from(schema.users),
    );
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsA.every((row) => row.tenantId === tenantA)).toBe(true);

    const rowsB = await tenantDb.withTenant(tenantB, async (tx) =>
      tx.select().from(schema.users),
    );
    expect(rowsB.every((row) => row.tenantId === tenantB)).toBe(true);
    expect(rowsB.some((row) => row.tenantId === tenantA)).toBe(false);
  });

  guarded('resolve_tenant_by_slug works without tenant context', async () => {
    const result = await appPool.query<{ id: string }>(
      'select * from resolve_tenant_by_slug($1)',
      [slugA],
    );
    expect(result.rows[0]?.id).toBe(tenantA);
  });
});
