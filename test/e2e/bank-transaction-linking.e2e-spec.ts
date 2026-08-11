/**
 * Task 4 (4.4/4.5): bank accounts + transactions against real Postgres end
 * to end, through the real HTTP layer (real JwtAuthGuard/TenantGuard/
 * RolesGuard, real ValidationPipe) — same reasoning as
 * payment-settlement.e2e-spec.ts's own "Finding 1": a unit test that mocks
 * the repository/service cannot catch a controller route that was never
 * wired, and the two hand-authored partial unique indexes
 * (bank_transactions_payment_uk / _expense_uk,
 * 0043_bank_transactions_link_unique_partial_index.sql) only actually exist
 * once a real migrated database is asked to enforce them.
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
import { Pool } from 'pg';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
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

describe('Bank accounts + transactions: link uniqueness against real Postgres', () => {
  let adminPool: Pool;
  let app: INestApplication;
  let accessToken: string;
  let available = false;

  const slug = `bank-e2e-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Bank transaction linking e2e could not reach Postgres. ' +
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

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `Bank E2E ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'Bank E2E User', 'FINANCE', true) returning id`,
      [tenantId, `finance@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'Bank E2E Customer'],
    );
    customerId = customerResult.rows[0]!.id;

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
    await adminPool.query(`delete from bank_transactions where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from bank_accounts where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from payments where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from document_sequences where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from users where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
  });

  it('links a payment to a bank transaction; a second link attempt 409s; balance reflects the signed sum', async () => {
    if (!available) {
      return;
    }

    const server = app.getHttpServer() as Server;

    const account = await request(server)
      .post('/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Operating', bankName: 'CBE', accountNumber: '1000234567890' })
      .expect(201);
    expect(account.body.balanceEtb).toBe('0.00');
    const accountId = account.body.id as string;

    const payment = await request(server)
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId, amountEtb: '500.00', method: 'CASH' })
      .expect(201);
    const paymentId = payment.body.id as string;

    // First link: succeeds. Deposit — positive signed amount.
    const firstLink = await request(server)
      .post(`/bank-accounts/${accountId}/transactions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        txDate: '2026-08-08',
        amountEtb: '500.00',
        kind: 'DEPOSIT',
        description: 'Customer payment deposited',
        paymentId,
      })
      .expect(201);
    expect(firstLink.body.paymentId).toBe(paymentId);
    expect(firstLink.body.amountEtb).toBe('500.00');

    // A withdrawal on the same account — proves balanceEtb is a signed sum,
    // not a magnitude sum: 500.00 - 120.00 = 380.00.
    await request(server)
      .post(`/bank-accounts/${accountId}/transactions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ txDate: '2026-08-09', amountEtb: '-120.00', kind: 'WITHDRAWAL' })
      .expect(201);

    const list = await request(server)
      .get('/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const listedAccount = (
      list.body.items as { id: string; balanceEtb: string }[]
    ).find((row) => row.id === accountId);
    expect(listedAccount?.balanceEtb).toBe('380.00');

    // Second link attempt to the SAME payment: the partial unique index
    // (tenant_id, payment_id) WHERE payment_id IS NOT NULL rejects it, and
    // BankTransactionsRepository.record reclassifies the 23505 as a 409,
    // never a raw 500.
    await request(server)
      .post(`/bank-accounts/${accountId}/transactions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        txDate: '2026-08-10',
        amountEtb: '500.00',
        kind: 'DEPOSIT',
        description: 'Duplicate link attempt',
        paymentId,
      })
      .expect(409);

    // Insert-only: no PUT/PATCH/DELETE route exists for a bank transaction
    // at all (route absence is proven by unit test — see
    // bank-accounts.controller.spec.ts — this just confirms the same fact
    // end to end: hitting a plausible URL 404s as an unmatched route, it
    // does not reach any handler that could mutate the row).
    await request(server)
      .patch(`/bank-accounts/${accountId}/transactions/${firstLink.body.id as string}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountEtb: '1.00' })
      .expect(404);
  });
});
