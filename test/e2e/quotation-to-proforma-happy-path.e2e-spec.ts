/**
 * Task 2: the end-to-end happy path this task exists for — an approved
 * quotation converts to an issued proforma with a real gapless number, and
 * that proforma is what then unblocks the project's QUOTATION -> PROFORMA
 * transition (the DAG gate in ProjectsService.updateStatus /
 * ProjectsRepository.hasIssuedProforma).
 *
 * The quotation itself is seeded directly via SQL (its own creation flow —
 * calc + VAT resolution — is exercised by quotations.service.spec.ts, not
 * this suite); only the approve -> convert -> project-transition chain runs
 * through the real repositories against a real transaction.
 *
 * Requires a migrated database (docker compose up -d && pnpm run db:migrate).
 * Skips itself if Postgres is unreachable (see tenant-isolation.e2e-spec.ts
 * for why an unreachable DB is a failure, not a pass, unless opted out).
 */
import { randomUUID } from 'node:crypto';

import { Decimal } from 'decimal.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../src/database/schema';
import { TenantDbService } from '../../src/database/tenant-db.service';
import { ProformasRepository } from '../../src/modules/proformas/proformas.repository';
import { ProjectsRepository } from '../../src/modules/projects/projects.repository';
import { ProjectsService } from '../../src/modules/projects/projects.service';
import { QuotationsRepository } from '../../src/modules/quotations/quotations.repository';
import type { AuthenticatedUser } from '../../src/types/auth.types';

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

describe('Quotation -> proforma -> project DAG happy path', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let available = false;

  const slug = `pf-happy-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let userId: string;
  let customerId: string;
  let projectId: string;
  let rateVersionId: string;
  let insertedRateVersion = false;
  let quoteId: string;
  let user: AuthenticatedUser;

  beforeAll(async () => {
    available = (await canConnect(ADMIN_URL)) && (await canConnect(APP_URL));
    if (!available) {
      const message =
        'Quotation-to-proforma happy-path e2e could not reach Postgres. ' +
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

    const tenantResult = await adminPool.query<{ id: string }>(
      `insert into tenants (slug, name, subscription_status, fiscal_year_start)
       values ($1, $2, 'ACTIVE', '07-08') returning id`,
      [slug, `PF Happy Path Test ${slug}`],
    );
    tenantId = tenantResult.rows[0]!.id;
    user = { userId: '', tenantId, role: 'SALES_MANAGER' };

    const userResult = await adminPool.query<{ id: string }>(
      `insert into users (tenant_id, email, password_hash, full_name, role, is_active)
       values ($1, $2, 'x', 'PF Happy Path Test User', 'SALES_MANAGER', true) returning id`,
      [tenantId, `sales@${slug}.example.com`],
    );
    userId = userResult.rows[0]!.id;
    user.userId = userId;

    const customerResult = await adminPool.query<{ id: string }>(
      `insert into customers (tenant_id, name) values ($1, $2) returning id`,
      [tenantId, 'PF Happy Path Test Customer'],
    );
    customerId = customerResult.rows[0]!.id;

    // Project starts at QUOTATION — the status this task's DAG gate guards
    // the exit from.
    const projectResult = await adminPool.query<{ id: string }>(
      `insert into projects (tenant_id, customer_id, name, status)
       values ($1, $2, $3, 'QUOTATION') returning id`,
      [tenantId, customerId, 'PF Happy Path Test Project'],
    );
    projectId = projectResult.rows[0]!.id;

    // ProformasRepository.issue() rejects conversion unless the quotation's
    // rateVersionId IS the currently open 'VAT' version (VAT-staleness
    // guard) — so this must reference the real open VAT row, not a
    // same-shaped stand-in kind. See the identical rationale in
    // proforma-numbering-concurrency.e2e-spec.ts: reuse the existing open
    // row via SELECT (rate_versions' partial unique index on (kind) WHERE
    // valid_to IS NULL means a second open 'VAT' insert would collide with
    // one seeded elsewhere); only insert — and only then clean up — when
    // this environment truly has none open yet.
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

    // Quotation seeded directly at PENDING_APPROVAL (its own creation flow —
    // calc + VAT resolution — is out of scope for this suite).
    const quoteResult = await adminPool.query<{ id: string }>(
      `insert into quotations (
         tenant_id, project_id, customer_id, quote_number, status,
         calc_input, technical_spec, pricing_breakdown, rate_version_id,
         subtotal_etb, margin_amount_etb, tax_amount_etb, total_price_etb
       ) values ($1, $2, $3, $4, 'PENDING_APPROVAL', '{}'::jsonb, '{}'::jsonb,
         '{}'::jsonb, $5, '100.00', '0.00', '15.00', '115.00')
       returning id`,
      [tenantId, projectId, customerId, `QTN-HAPPY-${slug}`, rateVersionId],
    );
    quoteId = quoteResult.rows[0]!.id;
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

  it('blocks the project DAG until the quotation is approved and converted, then unblocks it', async () => {
    if (!available) {
      return;
    }

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const quotationsRepo = new QuotationsRepository(tenantDb);
    const proformasRepo = new ProformasRepository(tenantDb);
    const projectsRepo = new ProjectsRepository(tenantDb);
    const projectsService = new ProjectsService(projectsRepo);

    // Before any proforma exists, the DAG gate blocks the manual transition.
    await expect(
      projectsService.updateStatus(user, projectId, 'PROFORMA'),
    ).rejects.toMatchObject({ status: 409 });

    // approve
    const approved = await quotationsRepo.updateStatus(
      tenantId,
      quoteId,
      'PENDING_APPROVAL',
      'APPROVED',
      { approvedByUserId: userId, approvedAt: new Date() },
    );
    expect(approved.status).toBe('APPROVED');

    // convert (one transaction: CAS quotation, claim number, insert proforma)
    const proforma = await proformasRepo.issue(tenantId, userId, quoteId, null);
    expect(proforma.status).toBe('ISSUED');
    expect(proforma.proformaNumber).toMatch(/^PF-FY\d{4}-\d{2}-0001$/);
    expect(proforma.projectId).toBe(projectId);
    expect(proforma.customerId).toBe(customerId);
    expect(proforma.subtotalEtb).toBe('100.00');
    expect(proforma.vatEtb).toBe('15.00');
    expect(proforma.totalEtb).toBe('115.00');

    const convertedQuote = await quotationsRepo.findById(tenantId, quoteId);
    expect(convertedQuote?.status).toBe('CONVERTED_TO_PROFORMA');

    // project transitions QUOTATION -> PROFORMA now that an issued proforma exists
    const project = await projectsService.updateStatus(
      user,
      projectId,
      'PROFORMA',
    );
    expect(project.status).toBe('PROFORMA');
  });

  it('a non-zero-margin quotation converts with subtotalEtb (taxable base) + vatEtb = totalEtb exactly', async () => {
    if (!available) {
      return;
    }

    // The suite's other quotation has margin_amount_etb = '0.00', which
    // can't distinguish "copies the taxable base" from "copies the
    // pre-margin subtotal" (CRITICAL 1) — both give the same number when
    // margin is zero. This one has a real margin, so subtotalEtb must be
    // subtotal + margin (120.00), not the quotation's own pre-margin
    // subtotalEtb (100.00), for the invariant to hold.
    const marginProject = await adminPool.query<{ id: string }>(
      `insert into projects (tenant_id, customer_id, name, status)
       values ($1, $2, $3, 'QUOTATION') returning id`,
      [tenantId, customerId, 'PF Happy Path Margin Test Project'],
    );
    const marginProjectId = marginProject.rows[0]!.id;

    // subtotal 100.00 + margin 20.00 = taxable base 120.00; VAT at 15% of
    // 120.00 = 18.00; total = 138.00.
    const marginQuote = await adminPool.query<{ id: string }>(
      `insert into quotations (
         tenant_id, project_id, customer_id, quote_number, status,
         calc_input, technical_spec, pricing_breakdown, rate_version_id,
         subtotal_etb, margin_amount_etb, tax_amount_etb, total_price_etb
       ) values ($1, $2, $3, $4, 'APPROVED', '{}'::jsonb, '{}'::jsonb,
         '{}'::jsonb, $5, '100.00', '20.00', '18.00', '138.00')
       returning id`,
      [tenantId, marginProjectId, customerId, `QTN-HAPPY-MARGIN-${slug}`, rateVersionId],
    );
    const marginQuoteId = marginQuote.rows[0]!.id;

    const db = drizzle(appPool, { schema });
    const tenantDb = new TenantDbService(db);
    const proformasRepo = new ProformasRepository(tenantDb);

    const proforma = await proformasRepo.issue(tenantId, userId, marginQuoteId, null);

    expect(proforma.subtotalEtb).toBe('120.00');
    expect(proforma.vatEtb).toBe('18.00');
    expect(proforma.totalEtb).toBe('138.00');
    expect(new Decimal(proforma.subtotalEtb).plus(proforma.vatEtb).toFixed(2)).toBe(
      proforma.totalEtb,
    );

    await adminPool.query(`delete from proformas where id = $1`, [proforma.id]);
    await adminPool.query(`delete from quotations where id = $1`, [marginQuoteId]);
    await adminPool.query(`delete from projects where id = $1`, [marginProjectId]);
  });
});
