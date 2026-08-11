/**
 * Task 4a (4.1/4.2): records a supplier expense with WHT withheld from the
 * rate table, then reverses it — against real Postgres end to end, through
 * the real HTTP layer (real JwtAuthGuard/TenantGuard/RolesGuard, real
 * ValidationPipe), same reasoning as payment-settlement.e2e-spec.ts's own
 * "Finding 1": a unit test that mocks the repository/service cannot catch a
 * controller route that was never wired.
 *
 * rate_versions is a GLOBAL table (no tenant scoping) — this test ensures
 * the real statutory rate seeds exist via seedRates() (idempotent: skips
 * any kind that already has an open version, per its own doc comment "safe
 * to run in every environment") rather than inserting competing rows, which
 * would violate the one-open-version-per-kind unique constraint.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { todayIso } from '../../src/common/business-time';
import * as schema from '../../src/database/schema';
import { RatesRepository } from '../../src/modules/rates/rates.repository';
import { seedRates } from '../../src/modules/rates/seed-rates';
import type { JwtPayload } from '../../src/types/auth.types';

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

describe('Expense withholding: record + reverse against real Postgres', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let app: INestApplication;
  let accessToken: string;
  let available = false;

  const slug = `expense-e2e-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Expense withholding e2e could not reach Postgres. ' +
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
    appPool = new Pool({ connectionString: APP_URL, max: 4 });

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `Expense E2E ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'Expense E2E User', 'FINANCE', true) returning id`,
      [tenantId, `finance@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    // Ensure VAT/WHT_GOODS/etc rate seeds exist — idempotent, no-op if a
    // previous test run (or db:seed) already opened them.
    const db = drizzle(adminPool, { schema });
    await seedRates(new RatesRepository(db));

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    accessToken = await app.get(JwtService).signAsync(
      { sub: userId, tenantId, role: 'FINANCE', type: 'access' } satisfies JwtPayload,
      { expiresIn: 900 },
    );
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await app.close();
    await adminPool.query(`delete from expenses where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from document_sequences where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from users where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('GOODS 25,000.00 above threshold: VAT split + 3% WHT withheld, then fully reversed', async () => {
    if (!available) {
      return;
    }

    const expenseDate = todayIso();

    const created = await request(app.getHttpServer() as Server)
      .post('/expenses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        supplierName: 'E2E Test Supplier',
        supplierTin: '0001112223',
        supplierLicenceOnFile: true,
        supplyKind: 'GOODS',
        category: 'MATERIALS',
        expenseDate,
        paidVia: 'CASH',
        vatIncluded: false,
        netAmountEtb: '25000.00',
        reference: 'INV-E2E-0001',
      })
      .expect(201);

    // VAT 15% on 25,000.00 net = 3,750.00; gross = 28,750.00.
    expect(created.body.netAmountEtb).toBe('25000.00');
    expect(created.body.vatEtb).toBe('3750.00');
    expect(created.body.amountEtb).toBe('28750.00');
    // 25,000 >= the 20,000 GOODS threshold -> 3% WHT = 750.00.
    expect(created.body.whtRatePercent).toBe('3.00');
    expect(created.body.whtEtb).toBe('750.00');
    // Cash actually paid = gross - wht = 28,750.00 - 750.00.
    expect(created.body.netPayableEtb).toBe('28000.00');
    expect(created.body.status).toBe('RECORDED');
    expect(typeof created.body.rateVersionId).toBe('string');

    const expenseId = created.body.id as string;

    // Confirm it's really in Postgres, gross column untouched by anything else.
    const dbRow = await adminPool.query<{ amount_etb: string; status: string }>(
      `select amount_etb, status from expenses where id = $1`,
      [expenseId],
    );
    expect(dbRow.rows[0]!.amount_etb).toBe('28750.00');
    expect(dbRow.rows[0]!.status).toBe('RECORDED');

    const reversed = await request(app.getHttpServer() as Server)
      .post(`/expenses/${expenseId}/reverse`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'E2E test reversal' })
      .expect(201);

    expect(reversed.body.amountEtb).toBe('-28750.00');
    expect(reversed.body.netAmountEtb).toBe('-25000.00');
    expect(reversed.body.vatEtb).toBe('-3750.00');
    expect(reversed.body.whtEtb).toBe('-750.00');
    expect(reversed.body.status).toBe('REVERSED');
    expect(reversed.body.reversalOfExpenseId).toBe(expenseId);

    // The original row is NEVER touched — still RECORDED, still positive.
    const originalAfterReversal = await adminPool.query<{
      amount_etb: string;
      status: string;
    }>(`select amount_etb, status from expenses where id = $1`, [expenseId]);
    expect(originalAfterReversal.rows[0]!.status).toBe('RECORDED');
    expect(originalAfterReversal.rows[0]!.amount_etb).toBe('28750.00');

    // Double reversal 409s.
    await request(app.getHttpServer() as Server)
      .post(`/expenses/${expenseId}/reverse`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Second attempt should fail' })
      .expect(409);
  });
});
