/**
 * Task 3: proves the full settlement path against real Postgres end to end
 * — issue an invoice, record a cash payment allocated to it, record the
 * withholding credit that covers the remainder, and check every place that
 * claims to know "what does this customer still owe" agrees to the cent:
 * the invoice's own status (PAID), `customers.outstanding_balance_etb`
 * (recomputeCustomerBalance), and the aging report (the invoice must drop
 * out entirely — its outstanding is <= 0).
 *
 * A mocked-transaction unit test cannot catch a disagreement between these
 * three: each of InvoicesRepository.recordWithholding,
 * recomputeCustomerBalance and agingReport is unit-tested in isolation
 * already (see invoices.repository.spec.ts / customer-balance.spec.ts /
 * invoice-aging.spec.ts) — this is the one place that runs all three back
 * to back against the same real invoice and checks the numbers line up.
 *
 * The withholding step specifically goes through the real HTTP layer
 * (supertest against a real Nest app, real JwtAuthGuard/TenantGuard/
 * RolesGuard, real ValidationPipe) rather than calling
 * InvoicesRepository.recordWithholding directly — that is exactly the gap
 * Finding 1 found: every other test for this feature called the repository
 * or service directly, so `POST /invoices/:id/withholding` had no
 * controller route at all and nothing caught it. This is the one test that
 * would have failed before that route existed.
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
import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { InvoicesRepository } from '../../src/modules/invoices/invoices.repository';
import { PaymentsRepository } from '../../src/modules/payments/payments.repository';
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

describe('Full settlement: invoice + payment + withholding credit', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let app: INestApplication;
  let accessToken: string;
  let available = false;

  const slug = `settlement-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;
  let rateVersionId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Payment settlement e2e could not reach Postgres. ' +
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
      [slug, `Settlement Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'Settlement Test User', 'FINANCE', true) returning id`,
      [tenantId, `finance@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'Settlement Test Customer'],
    );
    customerId = customerResult.rows[0]!.id;

    // Standalone invoices only need SOME valid rate_versions row to satisfy
    // the FK — InvoicesRepository.createStandalone never re-checks its kind
    // (that VAT-resolution logic lives in InvoicesService, one layer up, and
    // is bypassed here same as the proforma-numbering e2e bypasses
    // ProformasService). A synthetic kind keeps this test from touching any
    // real statutory rate row.
    const rateVersion = await adminPool.query<{ id: string }>(
      `insert into rate_versions (kind, valid_from, payload, source)
       values ($1, '2020-01-01', '{}'::jsonb, 'e2e-setup') returning id`,
      [`E2E_SETTLEMENT_${slug}`],
    );
    rateVersionId = rateVersion.rows[0]!.id;

    // Real Nest app (real AppModule — same guard chain, same ValidationPipe
    // shape as main.ts) so the withholding step below exercises the actual
    // HTTP route, not just the repository behind it. No existing e2e spec
    // does this yet (they all call repositories directly against Postgres),
    // so this is the simplest correct wiring: boot the full module graph
    // once, mint a real JWT for the FINANCE user created above via the same
    // JwtService/JWT_SECRET the app itself verifies against, and reuse both
    // for every HTTP call in this file.
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
    await adminPool.query(`delete from payment_allocations where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from payments where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from invoice_lines where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from invoices where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from document_sequences where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from rate_versions where id = $1`, [rateVersionId]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from users where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('115.00 invoice + 112.00 cash + 3.00 withholding: PAID, balance 0.00, dropped from aging', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const invoicesRepo = new InvoicesRepository(tenantDb);
    const paymentsRepo = new PaymentsRepository(tenantDb, invoicesRepo);

    const invoice = await invoicesRepo.createStandalone(tenantId, userId, {
      customerId,
      projectId: null,
      dueDate: null,
      subtotalEtb: '100.00',
      vatEtb: '15.00',
      totalEtb: '115.00',
      rateVersionId,
      lines: [
        {
          lineNo: 1,
          description: 'Settlement test line',
          quantity: '1',
          unitPriceEtb: '100.00',
          lineTotalEtb: '100.00',
        },
      ],
    });
    expect(invoice.status).toBe('ISSUED');

    const afterInvoice = await adminPool.query<{ outstanding_balance_etb: string }>(
      `select outstanding_balance_etb from customers where id = $1`,
      [customerId],
    );
    expect(afterInvoice.rows[0]!.outstanding_balance_etb).toBe('115.00');

    const payment = await paymentsRepo.record(tenantId, userId, {
      customerId,
      amountEtb: '112.00',
      method: 'CASH',
      allocations: [{ invoiceId: invoice.id, amountEtb: '112.00' }],
    });
    expect(payment.allocations).toHaveLength(1);

    const afterPayment = await adminPool.query<{
      status: string;
      outstanding_balance_etb: string;
    }>(
      `select i.status, c.outstanding_balance_etb
       from invoices i join customers c on c.id = i.customer_id
       where i.id = $1`,
      [invoice.id],
    );
    // Not yet fully settled: 112 cash alone is short of the 115 total.
    expect(afterPayment.rows[0]!.status).toBe('PARTIALLY_PAID');
    expect(afterPayment.rows[0]!.outstanding_balance_etb).toBe('3.00');

    // Finding 1: this must go through the real HTTP layer, not
    // invoicesRepo.recordWithholding() directly — a controller route that
    // was never wired would pass a repository-level call and only show up
    // here, as a 404 on POST /invoices/:id/withholding.
    const withheldResponse = await request(app.getHttpServer() as Server)
      .post(`/invoices/${invoice.id}/withholding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountEtb: '3.00', voucherRef: 'WHT-TEST-0001' })
      .expect(200);
    expect(withheldResponse.body.status).toBe('PAID');
    expect(withheldResponse.body.whtEtb).toBe('3.00');

    // Fact #1: the invoice's own status head.
    const finalInvoice = await adminPool.query<{ status: string }>(
      `select status from invoices where id = $1`,
      [invoice.id],
    );
    expect(finalInvoice.rows[0]!.status).toBe('PAID');

    // Fact #2: customers.outstanding_balance_etb (recomputeCustomerBalance).
    const finalCustomer = await adminPool.query<{ outstanding_balance_etb: string }>(
      `select outstanding_balance_etb from customers where id = $1`,
      [customerId],
    );
    expect(finalCustomer.rows[0]!.outstanding_balance_etb).toBe('0.00');

    // Fact #3: the aging report — a fully settled invoice must not appear
    // at all (outstanding <= 0 is excluded by agingReport's own definition).
    const aging = await invoicesRepo.agingReport(tenantId);
    expect(aging.find((row) => row.customerId === customerId)).toBeUndefined();
  });
});
