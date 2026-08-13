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
  customers,
  invoices,
  maintenanceContracts,
  payments,
  projects,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
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
          ...(dto.smsConsentGiven !== undefined
            ? { smsConsentAt: dto.smsConsentGiven ? new Date() : null }
            : {}),
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
          // smsConsentGiven's own doc comment on CreateCustomerDto.
          ...(dto.smsConsentGiven !== undefined
            ? { smsConsentAt: dto.smsConsentGiven ? new Date() : null }
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
}
