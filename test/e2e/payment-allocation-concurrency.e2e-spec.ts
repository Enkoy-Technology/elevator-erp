/**
 * Task 3: proves PaymentsRepository.guardAndInsertAllocation's per-invoice
 * `pg_advisory_xact_lock` actually serializes two concurrent allocations
 * against the SAME invoice instead of racing the over-allocation invariant
 * (Σ allocations + whtEtb <= totalEtb). A mocked-transaction unit test
 * cannot catch this — the property under test is specifically that real
 * Postgres's advisory lock makes the second transaction block until the
 * first commits and re-reads a fresh "already allocated" total, rather than
 * both transactions reading the same stale total under READ COMMITTED and
 * both passing the check. Mirrors rates-rotation-concurrency.e2e-spec.ts /
 * proforma-numbering-concurrency.e2e-spec.ts's structure.
 *
 * Two DIFFERENT payments allocate against the same invoice (not the same
 * payment twice) — a duplicate (payment, invoice) pair would instead trip
 * `payment_allocations`'s own unique constraint, which is a different
 * guard than the one this test targets.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { WorkflowTransitionError } from '../../src/common/exceptions';
import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { InvoicesRepository } from '../../src/modules/invoices/invoices.repository';
import {
  PaymentsRepository,
  type PaymentAllocationRecord,
} from '../../src/modules/payments/payments.repository';

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

describe('Payment allocation over-allocation under concurrency', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `alloc-conc-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;
  let rateVersionId: string;
  let invoiceId: string;
  let paymentAId: string;
  let paymentBId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Payment allocation concurrency e2e could not reach Postgres. ' +
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
    // max: 4 so two concurrent PaymentsRepository.allocate() calls each get
    // their own connection — if the pool forced them onto one connection,
    // that alone would serialize the transactions and the test would prove
    // nothing about the advisory lock.
    appPool = new Pool({ connectionString: APP_URL, max: 4 });

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `Alloc Concurrency Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'Alloc Concurrency Test User', 'FINANCE', true) returning id`,
      [tenantId, `finance@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'Alloc Concurrency Test Customer'],
    );
    customerId = customerResult.rows[0]!.id;

    const rateVersion = await adminPool.query<{ id: string }>(
      `insert into rate_versions (kind, valid_from, payload, source)
       values ($1, '2020-01-01', '{}'::jsonb, 'e2e-setup') returning id`,
      [`E2E_ALLOC_CONC_${slug}`],
    );
    rateVersionId = rateVersion.rows[0]!.id;

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const invoicesRepo = new InvoicesRepository(tenantDb);
    const paymentsRepo = new PaymentsRepository(tenantDb, invoicesRepo);

    // Invoice total 100.00 — each of the two allocation attempts below
    // (60.00 apiece) is individually within bounds but together exceeds it.
    const invoice = await invoicesRepo.createStandalone(tenantId, userId, {
      customerId,
      projectId: null,
      dueDate: null,
      subtotalEtb: '86.96',
      vatEtb: '13.04',
      totalEtb: '100.00',
      rateVersionId,
      lines: [
        {
          lineNo: 1,
          description: 'Alloc concurrency test line',
          quantity: '1',
          unitPriceEtb: '86.96',
          lineTotalEtb: '86.96',
        },
      ],
    });
    invoiceId = invoice.id;

    // Two SEPARATE unallocated payments, each big enough on its own to cover
    // its attempted allocation — the payment-level own-amount guard must not
    // be what rejects the loser, only the invoice-level total must.
    const paymentA = await paymentsRepo.record(tenantId, userId, {
      customerId,
      amountEtb: '60.00',
      method: 'CASH',
    });
    paymentAId = paymentA.id;
    const paymentB = await paymentsRepo.record(tenantId, userId, {
      customerId,
      amountEtb: '60.00',
      method: 'CASH',
    });
    paymentBId = paymentB.id;
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
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

  it('two concurrent 60.00 allocations against a 100.00 invoice: exactly one succeeds, the other 409s, Σ allocations never exceeds the total', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const invoicesRepo = new InvoicesRepository(tenantDb);
    const paymentsRepo = new PaymentsRepository(tenantDb, invoicesRepo);

    const results = await Promise.allSettled([
      paymentsRepo.allocate(tenantId, paymentAId, invoiceId, '60.00'),
      paymentsRepo.allocate(tenantId, paymentBId, invoiceId, '60.00'),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<PaymentAllocationRecord> => r.status === 'fulfilled',
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(WorkflowTransitionError);
    expect((rejected[0]!.reason as WorkflowTransitionError).status).toBe(409);

    // Σ allocations for this invoice never exceeds its 100.00 total — the
    // exact invariant the advisory lock exists to protect under concurrency.
    const sumRow = await adminPool.query<{ total: string | null }>(
      `select sum(amount_etb)::text as total from payment_allocations where invoice_id = $1`,
      [invoiceId],
    );
    expect(sumRow.rows[0]!.total).toBe('60.00');

    const invoiceRow = await adminPool.query<{ status: string }>(
      `select status from invoices where id = $1`,
      [invoiceId],
    );
    expect(invoiceRow.rows[0]!.status).toBe('PARTIALLY_PAID');
  });
});
