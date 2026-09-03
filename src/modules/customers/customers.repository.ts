import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, count, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { CustomerInUseError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import {
  assets,
  contracts,
  customers,
  invoices,
  maintenanceContracts,
  paymentAllocations,
  payments,
  proformas,
  projects,
  quotations,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type {
  CustomerOverview,
  CustomerOverviewAsset,
  CustomerOverviewContract,
  CustomerOverviewInvoice,
  CustomerOverviewMaintenance,
  CustomerOverviewPayment,
  CustomerOverviewProforma,
  CustomerOverviewProject,
  CustomerOverviewQuotation,
  OverviewSection,
} from './customer-overview';
import {
  buildStatement,
  type StatementResult,
  type StatementSourceRow,
} from './customer-statement';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

export type CustomerRecord = typeof customers.$inferSelect;
export type CustomerStatement = StatementResult & {
  customerId: string;
  customerName: string;
};

export interface SimilarCustomer {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

/** Enough digits to be a real phone rather than an area code. */
const MIN_PHONE_DIGITS = 7;

/** How many rows each `overview()` section shows. The page says "Projects 12"
 * and lists five of them; `total` is what makes that first number honest. */
const OVERVIEW_RECENT_LIMIT = 5;

/**
 * The match count across the whole filtered set, computed by Postgres before
 * `limit` applies — so one query yields both `total` and `recent`. A fresh
 * `sql` instance per call so drizzle never has to share one alias across
 * queries.
 */
const overallTotal = () => sql<string>`count(*) over ()`;

/**
 * Splits `[{...row, overallTotal}]` into `{ total, recent }`. Every row
 * carries the same window count, so row 0 answers for all of them; zero rows
 * means zero matches, which is why the empty case is 0 rather than a missing
 * total.
 */
const toSection = <TRow extends object>(
  rows: (TRow & { overallTotal: string })[],
): { total: number; recent: TRow[] } => ({
  total: rows.length === 0 ? 0 : Number(rows[0]?.overallTotal ?? 0),
  recent: rows.map(({ overallTotal: _overallTotal, ...rest }) => rest as unknown as TRow),
});

@Injectable()
export class CustomersRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<CustomerRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(customers.deletedAt)];
      if (options.search && options.search.trim().length > 0) {
        const pattern = `%${options.search.trim().toLowerCase()}%`;
        const namePattern = `%${normalizeEthiopic(options.search.trim())}%`;
        // coalesce() to a plain-lowercase `name` match covers any row whose
        // nameNormalized is NULL (see the comment on the same pattern in
        // findSimilar() below) so an out-of-band insert never becomes
        // silently unsearchable by name.
        filters.push(
          sql`(coalesce(${customers.nameNormalized}, lower(${customers.name})) like ${namePattern} or lower(coalesce(${customers.email}, '')) like ${pattern} or coalesce(${customers.phone}, '') like ${pattern})`,
        );
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(customers)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every customer matching the same filters `list()` honors, for
   * bulk export. Pages through in batches rather than loading the full
   * table at once.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `createdAt` values (bulk import, seed data) no longer duplicate
   * or skip rows across batch boundaries — concurrent inserts/deletes can
   * still shift the offset window; acceptable for ad-hoc admin downloads,
   * switch to keyset cursor before this feeds accounting reconciliation.
   * Perf ceiling: keyset if large-tenant exports time out.
   *
   * Tenant-scoping subtlety: `app.tenant_id` is a transaction-local GUC
   * (set by `withTenant`), so it does NOT survive across awaits/batches on
   * its own — each batch must open its own `withTenant` transaction rather
   * than reusing one `tx` across the whole generator.
   */
  async *streamAll(
    tenantId: string,
    options: { search?: string },
  ): AsyncGenerator<CustomerRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [isNull(customers.deletedAt)];
        if (options.search && options.search.trim().length > 0) {
          const pattern = `%${options.search.trim().toLowerCase()}%`;
          const namePattern = `%${normalizeEthiopic(options.search.trim())}%`;
          filters.push(
            sql`(coalesce(${customers.nameNormalized}, lower(${customers.name})) like ${namePattern} or lower(coalesce(${customers.email}, '')) like ${pattern} or coalesce(${customers.phone}, '') like ${pattern})`,
          );
        }
        return tx
          .select()
          .from(customers)
          .where(and(...filters))
          .orderBy(desc(customers.createdAt), asc(customers.id))
          .limit(BATCH_SIZE)
          .offset(offset);
      });
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  /**
   * Look-alike check for the create form. Warns, never blocks: name contains
   * in either direction (so "Addis Heights" matches "Addis Heights PLC" and
   * vice versa), or the same trailing 9 phone digits on either phone column
   * (so +251949922604, 0949922604 and 949922604 all match).
   */
  async findSimilar(
    tenantId: string,
    name: string,
    phone?: string,
  ): Promise<SimilarCustomer[]> {
    const needle = normalizeEthiopic(name.trim());
    if (!needle) {
      return [];
    }
    const digits = (phone ?? '').replace(/\D/g, '').slice(-9);

    // coalesce() falls back to a plain-lowercase match on `name` for any row
    // whose `nameNormalized` is NULL (out-of-band insert that bypassed this
    // repository) — without it, a NULL row would silently stop matching
    // anything, recreating the exact "customer looks missing, duplicate
    // gets created" bug this column exists to fix.
    const normalizedName = sql`coalesce(${customers.nameNormalized}, lower(${customers.name}))`;
    const signals = [
      sql`(${normalizedName} like ${`%${needle}%`} or ${needle} like '%' || ${normalizedName} || '%')`,
    ];
    if (digits.length >= MIN_PHONE_DIGITS) {
      signals.push(
        sql`${digits} in (
          right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 9),
          right(regexp_replace(coalesce(${customers.alternatePhone}, ''), '\\D', '', 'g'), 9)
        )`,
      );
    }

    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          city: customers.city,
        })
        .from(customers)
        .where(and(isNull(customers.deletedAt), or(...signals)))
        .orderBy(desc(customers.createdAt))
        .limit(5),
    );
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<CustomerRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, id), isNull(customers.deletedAt)),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(customers)
        .values({
          tenantId,
          name: dto.name,
          nameNormalized: normalizeEthiopic(dto.name),
          legalName: dto.legalName,
          email: dto.email?.toLowerCase(),
          phone: dto.phone,
          alternatePhone: dto.alternatePhone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          region: dto.region,
          country: dto.country ?? 'ET',
          buildingName: dto.buildingName,
          customerType: dto.customerType ?? 'COMMERCIAL',
          tags: dto.tags,
          notes: dto.notes,
          createdByUserId,
          // A brand-new row is never revoked; only "given" is meaningful at
          // create time (smsConsentAt already defaults to null otherwise).
          ...(dto.smsConsentGiven ? { smsConsentAt: new Date() } : {}),
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert customer');
      }
      return row;
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(customers)
        .set({
          ...(dto.name !== undefined
            ? { name: dto.name, nameNormalized: normalizeEthiopic(dto.name) }
            : {}),
          ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.toLowerCase() }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.alternatePhone !== undefined
            ? { alternatePhone: dto.alternatePhone }
            : {}),
          ...(dto.addressLine1 !== undefined
            ? { addressLine1: dto.addressLine1 }
            : {}),
          ...(dto.addressLine2 !== undefined
            ? { addressLine2: dto.addressLine2 }
            : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.region !== undefined ? { region: dto.region } : {}),
          ...(dto.country !== undefined ? { country: dto.country } : {}),
          ...(dto.buildingName !== undefined
            ? { buildingName: dto.buildingName }
            : {}),
          ...(dto.customerType !== undefined
            ? { customerType: dto.customerType }
            : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          // Server-stamped, never a client-supplied timestamp — see
          // smsConsentGiven's own doc comment on CreateCustomerDto. true is
          // a fresh grant (first-time or re-consenting after a revoke):
          // stamp smsConsentAt, clear any prior revocation. false revokes —
          // smsConsentAt is left untouched (phase-5 review I10: revoking
          // must not erase the historical fact consent was once given).
          ...(dto.smsConsentGiven === true
            ? { smsConsentAt: new Date(), smsConsentRevokedAt: null }
            : dto.smsConsentGiven === false
              ? { smsConsentRevokedAt: new Date() }
              : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Customer not found');
      }
      return row;
    });
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      // Same tenant transaction as the delete itself, so the dependent
      // counts and the delete are consistent — no window where a project
      // gets attached between the check and the write.
      const [projectRow] = await tx
        .select({ value: count() })
        .from(projects)
        .where(and(eq(projects.customerId, id), isNull(projects.deletedAt)));
      const [assetRow] = await tx
        .select({ value: count() })
        .from(assets)
        .where(and(eq(assets.customerId, id), isNull(assets.deletedAt)));
      const [contractRow] = await tx
        .select({ value: count() })
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.customerId, id),
            isNull(maintenanceContracts.deletedAt),
          ),
        );
      // R5: invoices have no deletedAt column at all (see invoices.ts —
      // VOID is the terminal state, not a soft-delete), so any non-VOID
      // invoice is live customer history. Without this, a customer billed
      // ONLY via a standalone invoice (none of the three checks above) can
      // be deleted while still owing money — it then stays visible on the
      // aging report (that join has no deletedAt filter) while its own
      // statement 404s (`statement()` above filters on isNull(deletedAt))
      // and there is no UI path left to record the payment against it.
      const [invoiceRow] = await tx
        .select({ value: count() })
        .from(invoices)
        .where(and(eq(invoices.customerId, id), ne(invoices.status, 'VOID')));

      // Non-reversed ("live") payments — same definition as
      // recomputeCustomerBalance (common/customer-balance.ts): excludes a
      // reversal row itself AND any payment something else points at as
      // reversalOfPaymentId. A fully-reversed pair nets to zero and leaves
      // no live money behind, so it does not block deletion; anything else
      // does — including unallocated advance cash, which has no invoice to
      // be caught by the count above.
      const customerPayments = await tx
        .select({ id: payments.id, reversalOfPaymentId: payments.reversalOfPaymentId })
        .from(payments)
        .where(eq(payments.customerId, id));
      const reversedPaymentIds = new Set(
        customerPayments
          .map((payment) => payment.reversalOfPaymentId)
          .filter((paymentId): paymentId is string => paymentId !== null),
      );
      const paymentCount = customerPayments.filter(
        (payment) =>
          payment.reversalOfPaymentId === null && !reversedPaymentIds.has(payment.id),
      ).length;

      const projectCount = Number(projectRow?.value ?? 0);
      const assetCount = Number(assetRow?.value ?? 0);
      const contractCount = Number(contractRow?.value ?? 0);
      const invoiceCount = Number(invoiceRow?.value ?? 0);
      if (projectCount + assetCount + contractCount + invoiceCount + paymentCount > 0) {
        throw new CustomerInUseError(
          projectCount,
          assetCount,
          contractCount,
          invoiceCount,
          paymentCount,
        );
      }

      const [row] = await tx
        .update(customers)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .returning({ id: customers.id });
      if (!row) {
        throw new NotFoundException('Customer not found');
      }
    });
  }

  /**
   * Chronological AR statement for one customer between `from`/`to`
   * (business-calendar dates, both inclusive) — invoice debit rows, payment/
   * reversal credit rows and withholding-credit rows (see
   * `buildStatement`'s own doc comment for why WHT is folded in), merged and
   * running-balanced by the pure `buildStatement` helper.
   *
   * Exactly two queries — invoices and payments, both scoped to this one
   * customer (small, bounded result sets) — fetched in full rather than
   * pre-filtered to [from, to] in SQL: computing openingBalance needs every
   * row before `from` too, and a business-calendar-date comparison
   * (`todayIso`, Africa/Addis_Ababa) is simplest done once in TS on values
   * already in hand rather than duplicated as raw-SQL timezone arithmetic.
   */
  async statement(
    tenantId: string,
    customerId: string,
    from: string,
    to: string,
  ): Promise<CustomerStatement> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
        .limit(1);
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      const invoiceRows = await tx
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          totalEtb: invoices.totalEtb,
          whtEtb: invoices.whtEtb,
          whtVoucherRef: invoices.whtVoucherRef,
          whtRecordedAt: invoices.whtRecordedAt,
          issuedAt: invoices.issuedAt,
        })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), ne(invoices.status, 'VOID')));

      const paymentRows = await tx
        .select({
          id: payments.id,
          receiptNumber: payments.receiptNumber,
          amountEtb: payments.amountEtb,
          receivedAt: payments.receivedAt,
        })
        .from(payments)
        .where(eq(payments.customerId, customerId));

      const sourceRows: StatementSourceRow[] = [
        ...invoiceRows.map((row) => ({
          id: row.id,
          kind: 'invoice' as const,
          date: todayIso(row.issuedAt),
          reference: row.invoiceNumber,
          amountEtb: row.totalEtb,
        })),
        ...invoiceRows
          .filter((row) => new Decimal(row.whtEtb).gt(0))
          .map((row) => ({
            // Synthetic id (not a real payment_allocations/table row) — the
            // withholding credit is a derived line sourced from the same
            // invoices query, not its own DB row (see buildStatement's doc
            // comment), so it needs an id distinct from the invoice's own
            // debit row above.
            id: `${row.id}-wht`,
            kind: 'withholding' as const,
            date: todayIso(row.whtRecordedAt ?? row.issuedAt),
            reference: row.whtVoucherRef ?? row.invoiceNumber,
            amountEtb: row.whtEtb,
          })),
        ...paymentRows.map((row) => ({
          id: row.id,
          kind: 'payment' as const,
          date: todayIso(row.receivedAt),
          reference: row.receiptNumber,
          amountEtb: row.amountEtb,
        })),
      ];

      const result = buildStatement({ from, to, sourceRows });
      return { customerId, customerName: customer.name, ...result };
    });
  }

  /**
   * Everything hanging off one customer, in a single tenant transaction:
   * eight related-record sections, each a full `total` plus the newest five.
   *
   * Query budget is FIXED at 12 regardless of how much history the customer
   * has — one per section, plus the existence check and three money sums.
   * Each section query carries its own `count(*) over ()`, which Postgres
   * computes across the whole match set BEFORE `limit`, so `total` and
   * `recent` come from one query against one filter and cannot drift apart
   * the way a separate COUNT eventually does.
   *
   * Ordering is `createdAt desc` in every section — deliberately the same
   * ordering each module's own list endpoint uses, so "the five most recent"
   * here means the same five that sit at the top of that module's list. Note
   * `contracts.signedAt` and `maintenance.nextServiceAt` are NOT used for
   * ordering: signedAt is null for every DRAFT, and nextServiceAt points
   * forward, not back.
   */
  async overview(
    tenantId: string,
    customerId: string,
    sections: readonly OverviewSection[],
  ): Promise<CustomerOverview> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
        .limit(1);
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      // A section the caller may not see is never queried, let alone
      // returned. This endpoint reads eight modules' data behind ONE
      // controller's gate, so without this it hands a dispatcher the AR
      // ledger that InvoicesController would refuse them.
      const visible = new Set(sections);
      const load = async <T>(
        name: OverviewSection,
        run: () => Promise<T[]>,
      ): Promise<T[]> => (visible.has(name) ? run() : []);

      const projectRows = await load('projects', () =>
        tx
        .select({
          id: projects.id,
          name: projects.name,
          status: projects.status,
          city: projects.siteCity,
          contractValueEtb: projects.contractAmountEtb,
          overallTotal: overallTotal(),
        })
        .from(projects)
        .where(
          and(eq(projects.customerId, customerId), isNull(projects.deletedAt)),
        )
        .orderBy(desc(projects.createdAt), asc(projects.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const quotationRows = await load('quotations', () =>
        tx
        .select({
          id: quotations.id,
          quoteNumber: quotations.quoteNumber,
          status: quotations.status,
          totalPriceEtb: quotations.totalPriceEtb,
          createdAt: quotations.createdAt,
          overallTotal: overallTotal(),
        })
        .from(quotations)
        .where(
          and(
            eq(quotations.customerId, customerId),
            isNull(quotations.deletedAt),
          ),
        )
        .orderBy(desc(quotations.createdAt), asc(quotations.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      // proformas/contracts/invoices/payments carry no deletedAt column —
      // they are append-only document books where cancellation is a status
      // (CANCELLED / VOID), not a soft delete. Those rows stay visible here
      // on purpose: a cancelled proforma is history the customer page must
      // still show. Only the money sums below exclude VOID.
      const proformaRows = await load('proformas', () =>
        tx
        .select({
          id: proformas.id,
          proformaNumber: proformas.proformaNumber,
          status: proformas.status,
          totalEtb: proformas.totalEtb,
          issuedAt: proformas.issuedAt,
          overallTotal: overallTotal(),
        })
        .from(proformas)
        .where(eq(proformas.customerId, customerId))
        .orderBy(desc(proformas.createdAt), asc(proformas.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const contractRows = await load('contracts', () =>
        tx
        .select({
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          status: contracts.status,
          contractValueEtb: contracts.contractValueEtb,
          signedAt: contracts.signedAt,
          overallTotal: overallTotal(),
        })
        .from(contracts)
        .where(eq(contracts.customerId, customerId))
        .orderBy(desc(contracts.createdAt), asc(contracts.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const invoiceRows = await load('invoices', () =>
        tx
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          totalEtb: invoices.totalEtb,
          dueDate: invoices.dueDate,
          overallTotal: overallTotal(),
        })
        .from(invoices)
        .where(eq(invoices.customerId, customerId))
        .orderBy(desc(invoices.createdAt), asc(invoices.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const paymentRows = await load('payments', () =>
        tx
        .select({
          id: payments.id,
          amountEtb: payments.amountEtb,
          receivedAt: payments.receivedAt,
          method: payments.method,
          overallTotal: overallTotal(),
        })
        .from(payments)
        .where(eq(payments.customerId, customerId))
        .orderBy(desc(payments.createdAt), asc(payments.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const assetRows = await load('assets', () =>
        tx
        .select({
          id: assets.id,
          category: assets.category,
          buildingName: assets.buildingName,
          serialNumber: assets.serialNumber,
          status: assets.status,
          overallTotal: overallTotal(),
        })
        .from(assets)
        .where(and(eq(assets.customerId, customerId), isNull(assets.deletedAt)))
        .orderBy(desc(assets.createdAt), asc(assets.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      const maintenanceRows = await load('maintenance', () =>
        tx
        .select({
          id: maintenanceContracts.id,
          status: maintenanceContracts.status,
          recurrence: maintenanceContracts.recurrence,
          nextServiceAt: maintenanceContracts.nextServiceAt,
          assetId: maintenanceContracts.assetId,
          overallTotal: overallTotal(),
        })
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.customerId, customerId),
            isNull(maintenanceContracts.deletedAt),
          ),
        )
        .orderBy(asc(maintenanceContracts.nextServiceAt), asc(maintenanceContracts.id))
        .limit(OVERVIEW_RECENT_LIMIT),
      );

      // --- money -------------------------------------------------------
      // Summed by Postgres over `numeric` (exact decimal arithmetic, no
      // float anywhere) and read back as a string, then normalized to 2dp
      // with Decimal — never parsed into a JS number.
      //
      // outstandingEtb is Σ(totalEtb − whtEtb − allocated) over non-VOID
      // invoices, split into two aggregates because joining allocations
      // onto invoices in one query would multiply the invoice rows. That
      // is the SAME per-invoice formula agingReport, withOutstanding and
      // recomputeCustomerBalance already use, so this page can never
      // disagree with the aging report about what a customer owes. It is
      // deliberately NOT `customers.outstandingBalanceEtb`, which is the
      // NET account position (it also subtracts unapplied cash) and would
      // read as too low here for any customer holding advance payments.
      const [invoicedRow] = await tx
        .select({
          value: sql<string>`coalesce(sum(${invoices.totalEtb} - ${invoices.whtEtb}), 0)`,
        })
        .from(invoices)
        .where(
          and(eq(invoices.customerId, customerId), ne(invoices.status, 'VOID')),
        );

      const [allocatedRow] = await tx
        .select({
          value: sql<string>`coalesce(sum(${paymentAllocations.amountEtb}), 0)`,
        })
        .from(paymentAllocations)
        .innerJoin(
          invoices,
          and(
            eq(paymentAllocations.tenantId, invoices.tenantId),
            eq(paymentAllocations.invoiceId, invoices.id),
          ),
        )
        .where(
          and(eq(invoices.customerId, customerId), ne(invoices.status, 'VOID')),
        );

      // Unfiltered sum over every payment row, reversals included: a
      // reversal is a second row holding the EXACT negation of the
      // original's amount (PaymentsRepository.reverse -> `.negated()`), so
      // a reversed pair sums to zero and this equals the sum over "live"
      // payments by construction — not by coincidence. It also stays right
      // if partial reversals ever land, which excluding both sides of the
      // pair would not.
      const [receivedRow] = await tx
        .select({
          value: sql<string>`coalesce(sum(${payments.amountEtb}), 0)`,
        })
        .from(payments)
        .where(eq(payments.customerId, customerId));

      const outstandingEtb = new Decimal(invoicedRow?.value ?? 0)
        .minus(allocatedRow?.value ?? 0)
        .toFixed(2);
      const receivedEtb = new Decimal(receivedRow?.value ?? 0).toFixed(2);

      // Sections are OMITTED, not emptied: absent means "not yours to see",
      // empty means "nothing here", and the page says different things for
      // the two.
      return {
        ...(visible.has('projects') && {
          projects: toSection<CustomerOverviewProject>(projectRows),
        }),
        ...(visible.has('quotations') && {
          quotations: toSection<CustomerOverviewQuotation>(quotationRows),
        }),
        ...(visible.has('proformas') && {
          proformas: toSection<CustomerOverviewProforma>(proformaRows),
        }),
        ...(visible.has('contracts') && {
          contracts: toSection<CustomerOverviewContract>(contractRows),
        }),
        ...(visible.has('invoices') && {
          invoices: {
            ...toSection<CustomerOverviewInvoice>(invoiceRows),
            outstandingEtb,
          },
        }),
        ...(visible.has('payments') && {
          payments: {
            ...toSection<CustomerOverviewPayment>(paymentRows),
            receivedEtb,
          },
        }),
        ...(visible.has('assets') && {
          assets: toSection<CustomerOverviewAsset>(assetRows),
        }),
        ...(visible.has('maintenance') && {
          maintenance: toSection<CustomerOverviewMaintenance>(maintenanceRows),
        }),
      };
    });
  }
}
