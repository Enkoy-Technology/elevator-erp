/**
 * Task 2 (2.2): proves ProformasRepository.issue()'s gapless per-tenant-
 * per-fiscal-year numbering actually serializes two concurrent issuances
 * instead of racing. A mocked-transaction unit test cannot catch this — the
 * claim is a single `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`
 * against real Postgres, and the property under test is that Postgres's own
 * row-level locking on the upsert (not an application-level advisory lock)
 * is enough to make it atomic under concurrency. Mirrors
 * rates-rotation-concurrency.e2e-spec.ts's structure.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { ProformasRepository } from '../../src/modules/proformas/proformas.repository';

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

describe('Proforma numbering under concurrency', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `pf-numbering-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;
  let projectAId: string;
  let projectBId: string;
  let rateVersionId: string;
  let insertedRateVersion = false;
  let quoteAId: string;
  let quoteBId: string;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Proforma numbering concurrency e2e could not reach Postgres. ' +
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
    // max: 4 so two concurrent ProformasRepository.issue() calls each get
    // their own connection — if the pool forced them onto one connection,
    // that alone would serialize the transactions and the test would prove
    // nothing about the upsert's own atomicity.
    appPool = new Pool({ connectionString: APP_URL, max: 4 });

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `PF Numbering Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'PF Numbering Test User', 'SALES_MANAGER', true) returning id`,
      [tenantId, `sales@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'PF Numbering Test Customer'],
    );
    customerId = customerResult.rows[0]!.id;

    const projectA = await adminPool.query<{ id: string }>(
      `insert into projects (tenant_id, customer_id, name, status)
       values ($1, $2, $3, 'QUOTATION') returning id`,
      [tenantId, customerId, 'PF Numbering Test Project A'],
    );
    projectAId = projectA.rows[0]!.id;
    const projectB = await adminPool.query<{ id: string }>(
      `insert into projects (tenant_id, customer_id, name, status)
       values ($1, $2, $3, 'QUOTATION') returning id`,
      [tenantId, customerId, 'PF Numbering Test Project B'],
    );
    projectBId = projectB.rows[0]!.id;

    // ProformasRepository.issue() rejects conversion unless the quotation's
    // rateVersionId IS the currently open 'VAT' version (VAT-staleness
    // guard) — so, unlike the old synthetic-kind approach, this must
    // reference the real open VAT row, not a same-shaped stand-in. Global
    // table (no tenant_id) — see RatesRepository's own doc comment.
    // 'kind' has a partial unique index on (kind) WHERE valid_to IS NULL, so
    // inserting a second open 'VAT' row would collide if one is already
    // seeded (db:seed:rates) — reuse it via SELECT instead of inserting;
    // only insert (and only then clean up) when this environment truly has
    // none open yet.
    const existingVat = await adminPool.query<{ id: string }>(
      `select id from rate_versions where kind = 'VAT' and valid_to is null limit 1`,
    );
    if (existingVat.rows[0]) {
      rateVersionId = existingVat.rows[0].id;
    } else {
      const rateVersion = await adminPool.query<{ id: string }>(
        `insert into rate_versions (kind, valid_from, payload, source)
         values ('VAT', '2020-01-01', '{"percent": "15"}'::jsonb, 'e2e-setup') returning id`,
      );
      rateVersionId = rateVersion.rows[0]!.id;
      insertedRateVersion = true;
    }

    const insertApprovedQuote = async (
      projectId: string,
      quoteNumber: string,
    ): Promise<string> => {
      // pricing_breakdown carries subtotalWithMargin — the value
      // ProformasRepository.issue() copies subtotalEtb from (see its own
      // doc comment) — required, or issue() throws before the numbering
      // claim this suite is actually testing.
      const result = await adminPool.query<{ id: string }>(
        `insert into quotations (
           tenant_id, project_id, customer_id, quote_number, status,
           calc_input, technical_spec, pricing_breakdown, rate_version_id,
           subtotal_etb, margin_amount_etb, tax_amount_etb, total_price_etb
         ) values ($1, $2, $3, $4, 'APPROVED', '{}'::jsonb, '{}'::jsonb,
           '{"subtotalWithMargin": "100.00"}'::jsonb, $5, '100.00', '0.00', '15.00', '115.00')
         returning id`,
        [tenantId, projectId, customerId, quoteNumber, rateVersionId],
      );
      return result.rows[0]!.id;
    };
    quoteAId = await insertApprovedQuote(projectAId, `QTN-CONC-A-${slug}`);
    quoteBId = await insertApprovedQuote(projectBId, `QTN-CONC-B-${slug}`);
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    await adminPool.query(`delete from proformas where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from document_sequences where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from quotations where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from projects where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from customers where tenant_id = $1`, [
      tenantId,
    ]);
    // Only clean up the rate_versions row if this run inserted it — a
    // pre-existing open VAT row (db:seed:rates or another suite) is shared
    // state, not this test's to delete.
    if (insertedRateVersion) {
      await adminPool.query(`delete from rate_versions where id = $1`, [
        rateVersionId,
      ]);
    }
    await adminPool.query(`delete from users where tenant_id = $1`, [
      tenantId,
    ]);
    await adminPool.query(`delete from tenants where id = $1`, [tenantId]);
    await adminPool.end();
    await appPool.end();
  });

  it('two concurrent issuances for the same tenant+fiscal-year both succeed with distinct, consecutive numbers', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const repo = new ProformasRepository(tenantDb);

    const results = await Promise.allSettled([
      repo.issue(tenantId, userId, quoteAId, null),
      repo.issue(tenantId, userId, quoteBId, null),
    ]);

    const fulfilled = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ proformaNumber: string }>).value);
    const rejected = results.filter((r) => r.status === 'rejected');

    // Both succeed — the numbering claim must not make either issuance race
    // or fail; only distinctness/gaplessness is under test here.
    expect(rejected).toHaveLength(0);
    expect(fulfilled).toHaveLength(2);

    const numbers = fulfilled.map((p) => p.proformaNumber).sort();
    expect(new Set(numbers).size).toBe(2); // no duplicate
    expect(numbers[0]).toMatch(/-0001$/);
    expect(numbers[1]).toMatch(/-0002$/); // no gap

    // document_sequences ends exactly at 2 — one row per (tenant, kind, FY),
    // claimed exactly twice, no lost update.
    const seqRows = await adminPool.query<{ last_value: number }>(
      `select last_value from document_sequences
       where tenant_id = $1 and kind = 'PROFORMA'`,
      [tenantId],
    );
    expect(seqRows.rows).toHaveLength(1);
    expect(seqRows.rows[0]!.last_value).toBe(2);

    // Both quotations actually landed on CONVERTED_TO_PROFORMA — the CAS
    // half of the same transaction committed alongside the claim+insert.
    const quoteStatuses = await adminPool.query<{ status: string }>(
      `select status from quotations where id = any($1::uuid[])`,
      [[quoteAId, quoteBId]],
    );
    expect(quoteStatuses.rows.every((r) => r.status === 'CONVERTED_TO_PROFORMA')).toBe(
      true,
    );
  });
});
