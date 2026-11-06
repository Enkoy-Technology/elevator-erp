/**
 * A lift from the factory: registered with its packing list, checked in, and
 * moved on. Runs the real repositories as `app_user`, so RLS applies.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself only with ALLOW_E2E_SKIP=1 (see tenant-isolation.e2e-spec.ts).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { ARRIVAL_CHECKLIST } from '../../src/modules/assets/arrival-checklist';
import { AssetTrackingRepository } from '../../src/modules/assets/asset-tracking.repository';
import { AssetsRepository } from '../../src/modules/assets/assets.repository';

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

describe('Lift arrival check', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;
  let assetsRepo: AssetsRepository;
  let tracking: AssetTrackingRepository;

  const slug = `asset-arrival-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;

  const newTenant = async (suffix: string) =>
    (
      await adminPool.query<{ id: string }>(
        `insert into tenants (slug, name, subscription_status, fiscal_year_start)
         values ($1, $2, 'ACTIVE', '07-08') returning id`,
        [`${slug}-${suffix}`, `Asset arrival ${suffix}`],
      )
    ).rows[0]!.id;

  const registerLift = (name: string, tenant = tenantId) =>
    assetsRepo.create(
      tenant,
      userId,
      { category: 'ELEVATOR', name, startingPoint: 'FROM_FACTORY' },
      { status: 'ON_ORDER', checklist: ARRIVAL_CHECKLIST },
    );

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Asset arrival e2e could not reach Postgres. ' +
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
    const tenantDb = new TenantDbService(drizzle(appPool, { schema }));
    assetsRepo = new AssetsRepository(tenantDb);
    tracking = new AssetTrackingRepository(tenantDb);

    tenantId = await newTenant('a');
    otherTenantId = await newTenant('b');
    userId = (
      await adminPool.query<{ id: string }>(
        `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
         values ($1, $2, 'x', 'Store Keeper', 'STORE_KEEPER', true) returning id`,
        [tenantId, `store@${slug}.example.com`],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    for (const tenant of [tenantId, otherTenantId]) {
      for (const table of [
        'asset_checklist_items',
        'asset_events',
        'assets',
        'users',
      ]) {
        await adminPool.query(`delete from ${table} where tenant_id = $1`, [
          tenant,
        ]);
      }
      await adminPool.query(`delete from tenants where id = $1`, [tenant]);
    }
    await Promise.all([adminPool.end(), appPool.end()]);
  });

  it('registers a lift in stock with 134 rows and a first history row', async () => {
    if (!available) return;
    const lift = await registerLift('Lift A');

    expect(lift).toMatchObject({ status: 'ON_ORDER', customerId: null });
    const items = await tracking.listItems(tenantId, lift.id);
    expect(items).toHaveLength(134);
    expect(items.map((item) => item.position)).toEqual(
      ARRIVAL_CHECKLIST.map((_, index) => index),
    );
    expect(items.every((item) => item.mark === null)).toBe(true);
    const events = await tracking.listEvents(tenantId, lift.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'REGISTERED',
      toStatus: 'ON_ORDER',
      createdByName: 'Store Keeper',
    });
  });

  it('All OK leaves a Missing alone, and the list counts it as short', async () => {
    if (!available) return;
    const lift = await registerLift('Lift B');
    const items = await tracking.listItems(tenantId, lift.id);
    const row = items.find((item) => item.caseNo === 4)!;
    await tracking.updateItem(
      tenantId,
      lift.id,
      row.id,
      { mark: 'MISSING', note: 'Two short' },
      userId,
    );

    await expect(
      tracking.markCaseOk(tenantId, lift.id, 4, userId),
    ).resolves.toBe(47);

    const after = await tracking.listItems(tenantId, lift.id);
    expect(after.find((item) => item.id === row.id)).toMatchObject({
      mark: 'MISSING',
      note: 'Two short',
      checkedByUserId: userId,
    });
    await expect(tracking.countUnmarked(tenantId, lift.id)).resolves.toBe(86);
    const page = await assetsRepo.list(tenantId, { search: 'Lift B' });
    expect(page.items[0]).toMatchObject({
      name: 'Lift B',
      customerName: null,
      shortParts: 1,
    });
  });

  it('a second press of the same step changes nothing', async () => {
    if (!available) return;
    const lift = await registerLift('Lift C');
    const press = {
      tenantId,
      assetId: lift.id,
      from: 'ON_ORDER',
      to: 'CHECKING',
      kind: 'STATUS',
      userId,
    } as const;

    await expect(tracking.moveStatus(press)).resolves.toBe(true);
    await expect(tracking.moveStatus(press)).resolves.toBe(false);

    const events = await tracking.listEvents(tenantId, lift.id);
    expect(events.filter((event) => event.kind === 'STATUS')).toHaveLength(1);
  });

  it('will not touch a row through another lift', async () => {
    if (!available) return;
    const mine = await registerLift('Lift D');
    const other = await registerLift('Lift E');
    const [otherRow] = await tracking.listItems(tenantId, other.id);

    await expect(
      tracking.updateItem(tenantId, mine.id, otherRow!.id, { mark: 'OK' }, userId),
    ).resolves.toBeNull();

    const [unchanged] = await tracking.listItems(tenantId, other.id);
    expect(unchanged?.mark).toBeNull();
  });

  it('keeps another tenant out of the checklist and history', async () => {
    if (!available) return;
    const lift = await registerLift('Lift F');

    await expect(tracking.listItems(otherTenantId, lift.id)).resolves.toEqual([]);
    await expect(tracking.listEvents(otherTenantId, lift.id)).resolves.toEqual([]);
    await expect(
      tracking.markCaseOk(otherTenantId, lift.id, 1, userId),
    ).resolves.toBe(0);
  });

  it('records who deleted a lift, in the same step', async () => {
    if (!available) return;
    const lift = await registerLift('Lift H');

    await assetsRepo.softDelete(tenantId, lift.id, userId);

    const events = await tracking.listEvents(tenantId, lift.id);
    expect(events[0]).toMatchObject({
      kind: 'DELETED',
      createdByName: 'Store Keeper',
    });
  });

  it('will not let the application rewrite history or remove a checklist row', async () => {
    if (!available) return;
    const lift = await registerLift('Lift I');
    const asApp = (sql: string) =>
      appPool.query(
        `with t as (select set_config('app.tenant_id', '${tenantId}', false)) ${sql}`,
      );

    await expect(
      asApp(`update asset_events set note = 'x' where asset_id = '${lift.id}'`),
    ).rejects.toThrow('permission denied');
    await expect(
      asApp(`delete from asset_events where asset_id = '${lift.id}'`),
    ).rejects.toThrow('permission denied');
    await expect(
      asApp(`delete from asset_checklist_items where asset_id = '${lift.id}'`),
    ).rejects.toThrow('permission denied');
  });

  it('filters stock from sold lifts', async () => {
    if (!available) return;
    await registerLift('Lift G');

    const stock = await assetsRepo.list(tenantId, { sold: false, search: 'Lift G' });
    const sold = await assetsRepo.list(tenantId, { sold: true, search: 'Lift G' });

    expect(stock.items).toHaveLength(1);
    expect(sold.items).toHaveLength(0);
  });
});
