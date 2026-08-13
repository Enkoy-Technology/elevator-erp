/**
 * Task 7.2: the deliverable the brief calls for explicitly — "a genuine
 * double-submit of a payment creates exactly one receipt", proven against
 * real Postgres and the real HTTP stack (supertest against a real Nest app:
 * real JwtAuthGuard/TenantGuard/RolesGuard/ValidationPipe, real
 * IdempotencyInterceptor, real IdempotencyKeysRepository).
 *
 * A mocked-transaction unit test cannot prove this: the property under test
 * is specifically that the SAME (tenant_id, key) unique constraint two
 * concurrent requests race against forces one of them to lose BEFORE it
 * ever calls PaymentsRepository.record — same reasoning as
 * payment-allocation-concurrency.e2e-spec.ts's own real-Postgres proof for
 * the advisory-lock invariant.
 *
 * Two DISTINCT idempotency scenarios are proven here:
 *  1. Genuinely concurrent (Promise.all, same key, same body): only one of
 *     the two requests may create a receipt — the other either replays that
 *     receipt or 409s as "in progress" (see IdempotencyKeysRepository.claim)
 *     — either way, exactly one row lands in `payments`.
 *  2. Sequential replay (the more common real case per the task brief: the
 *     first request actually finished, the client just never saw the
 *     response) — the second call replays the exact first response, byte
 *     for byte, with still only one row in `payments`.
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

describe('Payment idempotency — a genuine double-submit creates exactly one receipt', () => {
  let adminPool: Pool;
  let app: INestApplication;
  let accessToken: string;
  let available = false;

  const slug = `idem-dbl-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Payment idempotency double-submit e2e could not reach Postgres. ' +
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
      [slug, `Idempotency Double-Submit Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'Idempotency Test User', 'FINANCE', true) returning id`,
      [tenantId, `finance@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'Idempotency Test Customer'],
    );
    customerId = customerResult.rows[0]!.id;

    // Real Nest app — same guard/pipe/interceptor chain as main.ts — so
    // this exercises the actual HTTP route, not the repository behind it.
    // Same wiring as payment-settlement.e2e-spec.ts.
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
    await adminPool.query(`delete from document_sequences where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from idempotency_keys where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from users where tenant_id = $1`, [tenantId]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
  });

  it('two genuinely concurrent POST /payments with the same Idempotency-Key: exactly one row in `payments`', async () => {
    if (!available) {
      return;
    }

    const idempotencyKey = `double-submit-${randomUUID()}`;
    const body = { customerId, amountEtb: '112.00', method: 'CASH' };

    // Promise.all, not sequential awaits — the browser-hang scenario the
    // task brief describes (client clicks "Record payment" again while the
    // first click is still in flight), not a resubmit after the first
    // completed.
    const results = await Promise.allSettled([
      request(app.getHttpServer() as Server)
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body),
      request(app.getHttpServer() as Server)
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body),
    ]);

    // Both HTTP calls complete (supertest never rejects on a non-2xx
    // status) — what matters is what landed in the database, checked below.
    // Log status codes for a human reading a failure: one 201 + one 201
    // (replay) or one 201 + one 409 (in-progress) are both acceptable
    // outcomes of the race; two DIFFERENT receipt ids in `payments` is not.
    const settled = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : `rejected: ${String(r.reason)}`,
    );
    expect(settled.every((s) => typeof s === 'number')).toBe(true);

    const rows = await adminPool.query<{ id: string; amount_etb: string }>(
      `select id, amount_etb from payments where tenant_id = $1`,
      [tenantId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.amount_etb).toBe('112.00');
  });

  it('a SEQUENTIAL resubmit (first call already finished) replays the exact first response, still exactly one row', async () => {
    if (!available) {
      return;
    }

    const idempotencyKey = `sequential-replay-${randomUUID()}`;
    const body = { customerId, amountEtb: '55.00', method: 'CASH', reference: 'seq-replay' };

    const first = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    // Byte-for-byte the same response, not just "also a 201".
    expect(second.body).toEqual(first.body);

    const rows = await adminPool.query<{ id: string }>(
      `select id from payments where tenant_id = $1 and reference = 'seq-replay'`,
      [tenantId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.id).toBe(first.body.id);
  });

  it('the same key with a DIFFERENT body 409s and does not create a second row', async () => {
    if (!available) {
      return;
    }

    const idempotencyKey = `conflict-${randomUUID()}`;

    await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ customerId, amountEtb: '10.00', method: 'CASH', reference: 'conflict-1' })
      .expect(201);

    const conflicting = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ customerId, amountEtb: '999.00', method: 'CASH', reference: 'conflict-2' })
      .expect(409);
    expect(conflicting.body.type).toContain('idempotency-key-conflict');

    const rows = await adminPool.query<{ reference: string }>(
      `select reference from payments where tenant_id = $1 and reference in ('conflict-1', 'conflict-2')`,
      [tenantId],
    );
    expect(rows.rows.map((r) => r.reference)).toEqual(['conflict-1']);
  });
});
