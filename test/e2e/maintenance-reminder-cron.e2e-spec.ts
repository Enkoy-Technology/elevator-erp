/**
 * Task 2 (plan 5.3, brief §2.2): proves the maintenance daily reminder cron
 * against real Postgres, end to end — seed one active contract due inside
 * the window, run the job, and check the actual `outbound_messages` rows it
 * left behind (not a mock). Running it twice must add nothing: the outbox's
 * own dedupe swallow (task-1) is what makes a daily cron safe to run more
 * than once before the service date actually happens.
 *
 * Bypasses NestJS DI and wires the collaborators directly against the app
 * connection (RLS-scoped `app_user`, same as production request-path
 * queries) — same shape as outbox-enqueue-dedupe.e2e-spec.ts. The tenant
 * directory is stubbed to this one seeded tenant rather than the real
 * SECURITY DEFINER function, so this test stays isolated from whatever
 * other tenants a concurrently-run e2e suite leaves behind.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { todayIso } from '../../src/common/business-time';
import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { NotificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { OutboxRepository } from '../../src/modules/outbox/outbox.repository';
import { OutboxService } from '../../src/modules/outbox/outbox.service';
import { MaintenanceReminderRepository } from '../../src/modules/reminders/maintenance-reminders.repository';
import { MaintenanceReminderService } from '../../src/modules/reminders/maintenance-reminders.service';

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

const addDaysIso = (fromIso: string, days: number): string => {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('MaintenanceReminderService.runDailyReminders against real Postgres', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `maint-reminder-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let contractId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Maintenance reminder cron e2e could not reach Postgres. ' +
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
      [slug, `Maintenance Reminder Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name, phone, sms_consent_at)
       values ($1, 'Addis Heights PLC', '+251911234567', now())
       returning id`,
      [tenantId],
    );
    const customerId = customerResult.rows[0]!.id;

    const technicianResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, phone, role, sms_consent_at)
       values ($1, 'tech@example.com', 'x', 'Abebe Kebede', '+251922345678', 'FIELD_ENGINEER', now())
       returning id`,
      [tenantId],
    );
    const technicianId = technicianResult.rows[0]!.id;

    const assetResult = await adminPool.query<{ id: string }>(
      `insert into assets (tenant_id, customer_id, category, name, building_name)
       values ($1, $2, 'ELEVATOR', 'Elevator 2', 'West Wing')
       returning id`,
      [tenantId, customerId],
    );
    const assetId = assetResult.rows[0]!.id;

    // Due 2 days out — inside the default 3-day window.
    const nextServiceAt = addDaysIso(todayIso(), 2);
    const contractResult = await adminPool.query<{ id: string }>(
      `insert into maintenance_contracts
         (tenant_id, asset_id, customer_id, recurrence, status, start_date, next_service_at, assigned_user_id)
       values ($1, $2, $3, 'MONTHLY', 'ACTIVE', current_date, $4, $5)
       returning id`,
      [tenantId, assetId, customerId, nextServiceAt, technicianId],
    );
    contractId = contractResult.rows[0]!.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from notifications where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from outbound_messages where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from maintenance_contracts where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from assets where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from users where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('enqueues exactly one technician message and one customer message, and a second run adds nothing', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const tenantDirectory = { listActiveTenantIds: async () => [tenantId] };
    const service = new MaintenanceReminderService(
      tenantDirectory as never,
      new MaintenanceReminderRepository(tenantDb),
      new OutboxService(new OutboxRepository(tenantDb)),
      new NotificationsRepository(tenantDb),
    );

    await service.runDailyReminders();
    await service.runDailyReminders();
    await service.runDailyReminders();

    const messages = await adminPool.query<{
      recipient: string;
      dedupe_key: string;
      subject_kind: string;
      subject_id: string;
    }>(
      `select recipient, dedupe_key, subject_kind, subject_id
       from outbound_messages where tenant_id = $1 order by recipient`,
      [tenantId],
    );

    expect(messages.rows).toHaveLength(2);
    expect(messages.rows.map((r) => r.recipient).sort()).toEqual(
      ['+251911234567', '+251922345678'].sort(),
    );
    for (const row of messages.rows) {
      expect(row.subject_kind).toBe('MAINTENANCE_CONTRACT');
      expect(row.subject_id).toBe(contractId);
      expect(row.dedupe_key).toContain(`maint:${contractId}:`);
    }

    // The technician also gets an in-app notification (task-2 §2.4) — the
    // customer does not (no `users` row to target).
    const notifications = await adminPool.query<{ user_id: string; type: string }>(
      `select user_id, type from notifications where tenant_id = $1`,
      [tenantId],
    );
    expect(notifications.rows).toHaveLength(1);
    expect(notifications.rows[0]!.type).toBe('MAINTENANCE');
  });
});
