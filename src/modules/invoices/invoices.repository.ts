import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  sum,
} from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import type { TenantTransaction } from '../../database/database.types';
import {
  customers,
  documentSequences,
  invoiceLines,
  invoices,
  paymentAllocations,
  projects,
  proformas,
  rateVersions,
  tenants,
  type InvoiceStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { todayIso } from '../../common/business-time';
import { derivePaymentStatus } from './invoice-payment-status';
import { buildInvoiceNumber } from './invoice-number';

export type InvoiceRecord = typeof invoices.$inferSelect;
export type InvoiceLineRecord = typeof invoiceLines.$inferSelect;
export type InvoiceWithLines = InvoiceRecord & { lines: InvoiceLineRecord[] };
export type InvoiceExportRow = InvoiceRecord & { customerName: string | null };

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const INVOICE_SEQUENCE_KIND = 'INVOICE';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Postgres `unique_violation` (invoices_proforma_uk, or any other unique
 * constraint). drizzle-orm's node-postgres driver wraps the raw pg error
 * (which carries `.code`) inside a `DrizzleQueryError` whose OWN `.code` is
 * undefined — the real code only shows up one level down, on `.cause` (see
 * drizzle-orm/errors.js's `DrizzleQueryError`). Checking `err.code` alone
 * (the shape RatesRepository's own same-named helper checks) never matches
 * against a real driver error, only a hand-built test double shaped like
 * one — confirmed against a real double-convert 409 in
 * quotation-to-proforma-happy-path.e2e-spec.ts, which is what caught this.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (v: unknown): string | undefined =>
    typeof v === 'object' && v !== null
      ? (v as { code?: string }).code
      : undefined;
  return (
    code(err) === PG_UNIQUE_VIOLATION ||
    code((err as { cause?: unknown } | null)?.cause) === PG_UNIQUE_VIOLATION
  );
}

/** New line inserted alongside a fresh invoice, before ids/timestamps are assigned. */
interface NewInvoiceLine {
  lineNo: number;
  description: string;
  quantity: string;
  unitPriceEtb: string;
  lineTotalEtb: string;
}

export interface StandaloneInvoiceInput {
  customerId: string;
  projectId: string | null;
  dueDate: string | null;
  subtotalEtb: string;
  vatEtb: string;
  totalEtb: string;
  rateVersionId: string;
  lines: NewInvoiceLine[];
}

@Injectable()
export class InvoicesRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      status?: InvoiceStatus;
      customerId?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<InvoiceRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = this.buildListFilter(options);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(invoices)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every invoice matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE. Joined with the customer's
   * display name (export-only column, per the brief) — never a live
   * dependency for anything else, since `customers.name` can keep changing
   * after the invoice was issued.
   *
   * ponytail: offset batching with a PK tiebreaker, same ceiling as
   * ProformasRepository.streamAll — switch to keyset cursor before this
   * feeds accounting reconciliation at real tenant scale.
   */
  async *streamAll(
    tenantId: string,
    options: { status?: InvoiceStatus; customerId?: string; q?: string },
  ): AsyncGenerator<InvoiceExportRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const where = this.buildListFilter(options);
        return tx
          .select({
            ...getTableColumns(invoices),
            customerName: customers.name,
          })
          .from(invoices)
          .leftJoin(
            customers,
            and(
              eq(invoices.tenantId, customers.tenantId),
              eq(invoices.customerId, customers.id),
            ),
          )
          .where(where)
          .orderBy(desc(invoices.createdAt), asc(invoices.id))
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

  private buildListFilter(options: {
    status?: InvoiceStatus;
    customerId?: string;
    q?: string;
  }) {
    const filters = [];
    if (options.status) {
      filters.push(eq(invoices.status, options.status));
    }
    if (options.customerId) {
      filters.push(eq(invoices.customerId, options.customerId));
    }
    if (options.q && options.q.trim().length > 0) {
      const pattern = `%${options.q.trim().toLowerCase()}%`;
      filters.push(sql`lower(${invoices.invoiceNumber}) like ${pattern}`);
    }
    return filters.length > 0 ? and(...filters) : undefined;
  }

  async findByIdWithLines(
    tenantId: string,
    id: string,
  ): Promise<InvoiceWithLines | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      if (!invoice) {
        return null;
      }
      const lines = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, id))
        .orderBy(asc(invoiceLines.lineNo));
      return { ...invoice, lines };
    });
  }

  /**
   * Issues an invoice from an ISSUED proforma, in ONE tenant transaction:
   * check the proforma is ISSUED and not already invoiced, reject if VAT
   * has rotated since the proforma was priced, claim the next gapless
   * INVOICE number, insert the invoice with the proforma's own money
   * columns copied verbatim, and a single presentational line. Any failure
   * rolls back every write together.
   *
   * Deliberately reads the `proformas`/`projects`/`rate_versions` tables
   * directly (shared /database/schema tables) instead of composing
   * ProformasRepository — same reasoning as ProformasRepository.issue()
   * reading `quotations` directly: composing a separately-transacted
   * repository method would open a second transaction and break the
   * "all or none" guarantee this endpoint requires.
   */
  async issueFromProforma(
    tenantId: string,
    userId: string,
    proformaId: string,
    dueDate: string | null,
  ): Promise<InvoiceWithLines> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();

      // 1. Load the proforma and check it's ISSUED (not CANCELLED).
      const [proforma] = await tx
        .select()
        .from(proformas)
        .where(eq(proformas.id, proformaId))
        .limit(1);
      if (!proforma) {
        throw new NotFoundException('Proforma not found');
      }
      if (proforma.status !== 'ISSUED') {
        throw new WorkflowTransitionError(
          'Proforma must be ISSUED to convert to an invoice — it may be cancelled',
        );
      }

      // 2. VAT staleness guard: reject conversion if the open VAT version
      // has rotated since this proforma was priced. Mirrors
      // ProformasRepository.issue's own guard (same query shape, run
      // inside this same transaction for the same consistency reason).
      const [openVat] = await tx
        .select({ id: rateVersions.id })
        .from(rateVersions)
        .where(
          and(
            eq(rateVersions.kind, 'VAT'),
            lte(rateVersions.validFrom, today),
            or(isNull(rateVersions.validTo), gte(rateVersions.validTo, today)),
          ),
        )
        .orderBy(desc(rateVersions.validFrom))
        .limit(1);
      if (!openVat || openVat.id !== proforma.rateVersionId) {
        throw new WorkflowTransitionError(
          'VAT rate has changed since this proforma was priced — re-quote before converting. The legal ETR document will carry current VAT and this internal book must not diverge.',
        );
      }

      // 3. Fiscal year for today, claim the next gapless number.
      const fiscalYear = await this.fiscalYearForToday(tx, tenantId, today);
      const claimed = await this.claimSequence(tx, tenantId, fiscalYear.label);
      const invoiceNumber = buildInvoiceNumber(fiscalYear.label, claimed);

      // 4. Project name for the single presentational line — proformas
      // always carry a NOT NULL projectId (see proformas.ts), so this join
      // is guaranteed to find a row.
      const [project] = await tx
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, proforma.projectId))
        .limit(1);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // 5. Insert the invoice: money columns copied verbatim from the
      // proforma — same taxable-base semantics by construction (the
      // proforma's own subtotalEtb/vatEtb/totalEtb already satisfy
      // subtotal + vat = total, see ProformasRepository.issue's doc
      // comment). whtEtb stays at its schema default (0) — recorded when
      // payment arrives, Task 3's concern.
      let invoiceRow: InvoiceRecord | undefined;
      try {
        [invoiceRow] = await tx
          .insert(invoices)
          .values({
            tenantId,
            invoiceNumber,
            fiscalYearLabel: fiscalYear.label,
            proformaId: proforma.id,
            customerId: proforma.customerId,
            projectId: proforma.projectId,
            subtotalEtb: proforma.subtotalEtb,
            vatEtb: proforma.vatEtb,
            totalEtb: proforma.totalEtb,
            rateVersionId: proforma.rateVersionId,
            issuedByUserId: userId,
            dueDate,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            'This proforma has already been converted to an invoice',
          );
        }
        throw err;
      }
      if (!invoiceRow) {
        throw new Error('Failed to insert invoice');
      }

      // 6. Single presentational line — NOT one line per proforma pricing
      // row. ponytail: the proforma already holds the full pricing
      // breakdown snapshot for audit; per-item lines are only worth adding
      // when the client's own document photos demand that level of detail.
      const [line] = await tx
        .insert(invoiceLines)
        .values({
          tenantId,
          invoiceId: invoiceRow.id,
          lineNo: 1,
          description: `Supply and installation — ${project.name}`,
          quantity: '1',
          unitPriceEtb: invoiceRow.subtotalEtb,
          lineTotalEtb: invoiceRow.subtotalEtb,
        })
        .returning();
      if (!line) {
        throw new Error('Failed to insert invoice line');
      }

      return { ...invoiceRow, lines: [line] };
    });
  }

  /**
   * Standalone invoice (e.g. maintenance billing) — money already computed
   * by InvoicesService (line totals, subtotal, VAT, total; see
   * invoice-money.ts) since that math needs no DB access. This method only
   * owns the transaction-bound protocol: claim the gapless number and
   * insert invoice + lines together.
   */
  async createStandalone(
    tenantId: string,
    userId: string,
    input: StandaloneInvoiceInput,
  ): Promise<InvoiceWithLines> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();
      const fiscalYear = await this.fiscalYearForToday(tx, tenantId, today);
      const claimed = await this.claimSequence(tx, tenantId, fiscalYear.label);
      const invoiceNumber = buildInvoiceNumber(fiscalYear.label, claimed);

      const [invoiceRow] = await tx
        .insert(invoices)
        .values({
          tenantId,
          invoiceNumber,
          fiscalYearLabel: fiscalYear.label,
          proformaId: null,
          customerId: input.customerId,
          projectId: input.projectId,
          subtotalEtb: input.subtotalEtb,
          vatEtb: input.vatEtb,
          totalEtb: input.totalEtb,
          rateVersionId: input.rateVersionId,
          issuedByUserId: userId,
          dueDate: input.dueDate,
        })
        .returning();
      if (!invoiceRow) {
        throw new Error('Failed to insert invoice');
      }

      const lines = await tx
        .insert(invoiceLines)
        .values(
          input.lines.map((line) => ({
            tenantId,
            invoiceId: invoiceRow.id,
            ...line,
          })),
        )
        .returning();

      return { ...invoiceRow, lines };
    });
  }

  /**
   * VOID guard: only from ISSUED with zero allocations. Both conditions
   * are enforced by the WHERE clause itself (CAS + NOT EXISTS), atomically
   * — no separate read-then-write race window.
   */
  async voidInvoice(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(invoices)
        .set({ status: 'VOID', voidReason: reason, updatedAt: new Date() })
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.status, 'ISSUED'),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(paymentAllocations)
                .where(
                  and(
                    eq(paymentAllocations.tenantId, invoices.tenantId),
                    eq(paymentAllocations.invoiceId, invoices.id),
                  ),
                ),
            ),
          ),
        )
        .returning();
      if (row) {
        return row;
      }
      const exists = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      if (!exists[0]) {
        throw new NotFoundException('Invoice not found');
      }
      throw new WorkflowTransitionError(
        'Invoice can only be voided from ISSUED with zero payment allocations',
      );
    });
  }

  /**
   * Manual mirror of the customer's ETR/certified-device receipt — only
   * the five fiscal columns (see FiscalMirrorDto). Works on any non-VOID
   * status.
   */
  async patchFiscal(
    tenantId: string,
    id: string,
    patch: {
      fiscalReceiptNumber?: string;
      fiscalDeviceSerial?: string;
      fiscalIssuedAt?: string;
      fiscalKind?: string;
      fiscalNote?: string;
    },
  ): Promise<InvoiceRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.fiscalReceiptNumber !== undefined) {
        set.fiscalReceiptNumber = patch.fiscalReceiptNumber;
      }
      if (patch.fiscalDeviceSerial !== undefined) {
        set.fiscalDeviceSerial = patch.fiscalDeviceSerial;
      }
      if (patch.fiscalIssuedAt !== undefined) {
        set.fiscalIssuedAt = new Date(patch.fiscalIssuedAt);
      }
      if (patch.fiscalKind !== undefined) {
        set.fiscalKind = patch.fiscalKind;
      }
      if (patch.fiscalNote !== undefined) {
        set.fiscalNote = patch.fiscalNote;
      }

      const [row] = await tx
        .update(invoices)
        .set(set)
        .where(and(eq(invoices.id, id), ne(invoices.status, 'VOID')))
        .returning();
      if (row) {
        return row;
      }
      const exists = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      if (!exists[0]) {
        throw new NotFoundException('Invoice not found');
      }
      throw new WorkflowTransitionError(
        'Cannot set the fiscal mirror on a VOID invoice',
      );
    });
  }

  /**
   * Recomputes and CASes `status` off the actual Σ payment_allocations for
   * this invoice — the one place invoices.status is allowed to move
   * ISSUED -> PARTIALLY_PAID -> PAID. Exposed (tx-scoped) for Task 3 to call
   * from inside its own allocation-insert transaction, so the allocation
   * insert and the status recompute commit or roll back together. With no
   * `payment_allocations` rows yet (Task 3 not landed), this is exercised
   * by invoice-payment-status.spec.ts's derivation-matrix tests only — the
   * DB-integration half activates once allocations exist.
   *
   * No-op on a VOID invoice (VOID is terminal, never re-derived away from).
   */
  async recomputePaymentStatus(
    tx: TenantTransaction,
    invoiceId: string,
  ): Promise<InvoiceRecord> {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === 'VOID') {
      return invoice;
    }

    const [allocated] = await tx
      .select({ total: sum(paymentAllocations.amountEtb) })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.invoiceId, invoiceId));
    const allocatedEtb = allocated?.total ?? '0';

    const nextStatus = derivePaymentStatus({
      totalEtb: invoice.totalEtb,
      whtEtb: invoice.whtEtb,
      allocatedEtb,
    });
    if (nextStatus === invoice.status) {
      return invoice;
    }

    const [row] = await tx
      .update(invoices)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, invoice.status)))
      .returning();
    if (!row) {
      throw new Error(
        `Failed to CAS invoice ${invoiceId} status ${invoice.status} -> ${nextStatus}`,
      );
    }
    return row;
  }

  private async fiscalYearForToday(
    tx: TenantTransaction,
    tenantId: string,
    today: string,
  ) {
    const [tenant] = await tx
      .select({ fiscalYearStart: tenants.fiscalYearStart })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return computeFiscalYear(today, tenant.fiscalYearStart);
  }

  /**
   * Claims the next gapless number for (tenant, INVOICE, fiscal year) — a
   * single upsert statement is atomic under Postgres's row-level locking on
   * its own, same as ProformasRepository.issue's claim (no advisory lock
   * needed).
   */
  private async claimSequence(
    tx: TenantTransaction,
    tenantId: string,
    fiscalYearLabel: string,
  ): Promise<number> {
    const [claimed] = await tx
      .insert(documentSequences)
      .values({
        tenantId,
        kind: INVOICE_SEQUENCE_KIND,
        fiscalYearLabel,
        lastValue: 1,
      })
      .onConflictDoUpdate({
        target: [
          documentSequences.tenantId,
          documentSequences.kind,
          documentSequences.fiscalYearLabel,
        ],
        set: { lastValue: sql`${documentSequences.lastValue} + 1` },
      })
      .returning({ lastValue: documentSequences.lastValue });
    if (!claimed) {
      throw new Error('Failed to claim invoice number');
    }
    return claimed.lastValue;
  }
}
