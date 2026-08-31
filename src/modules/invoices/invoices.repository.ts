import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { isForeignKeyViolation } from '../../common/db-errors';
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
import { bucketForDaysOverdue, daysOverdue, invoiceOutstandingEtb } from './invoice-aging';
import type { InvoiceDocumentRow } from './invoice-document.mapper';
import { derivePaymentStatus } from './invoice-payment-status';
import { buildInvoiceNumber } from './invoice-number';

export type InvoiceRecord = typeof invoices.$inferSelect;
export type InvoiceLineRecord = typeof invoiceLines.$inferSelect;
export type InvoiceWithLines = InvoiceRecord & { lines: InvoiceLineRecord[] };
export type InvoiceExportRow = InvoiceRecord & { customerName: string | null };
/**
 * List row + Σ payment_allocations (allocatedEtb) and the derived
 * outstandingEtb — see `list()`'s own doc comment for the exact formula and
 * why it must never be computed any other way in this codebase.
 */
export type InvoiceListRow = InvoiceRecord & {
  allocatedEtb: string;
  outstandingEtb: string;
};

export interface AgingRow {
  customerId: string;
  customerName: string | null;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}

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

/** `issueDateIso` + `days` calendar days, as an ISO 'YYYY-MM-DD' string — same UTC-midnight math as rates.repository.ts's own `dayBefore` (2nd occurrence in this codebase; not yet worth a shared helper per this file's own "3rd+, extract" convention). */
function addDaysIso(issueDateIso: string, days: number): string {
  const d = new Date(`${issueDateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  ): Promise<PaginatedResult<InvoiceListRow>> {
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
      const withOutstanding = await this.withOutstanding(tx, items);
      return toPaginatedResult(withOutstanding, total, page, pageSize);
    });
  }

  /**
   * Attaches Σ payment_allocations (`allocatedEtb`) and the derived
   * `outstandingEtb` to a page of invoices — ONE aggregate query batched by
   * id (same "two queries, not N+1" shape as `agingReport`'s own
   * allocationSums join below), never a query per row.
   *
   * outstandingEtb = totalEtb − whtEtb − allocatedEtb for every non-VOID
   * invoice — the EXACT SAME formula `agingReport` and
   * `recomputeCustomerBalance` (common/customer-balance.ts) already use, so
   * this list, the aging report, and the customer's stored balance can never
   * silently disagree on what one invoice's own contribution is. VOID is
   * special-cased to '0.00' rather than the literal formula: both of those
   * two call sites EXCLUDE VOID invoices from this sum entirely (they never
   * compute a value for one), and a VOID invoice's allocations/whtEtb are
   * always zero by construction (voidInvoice's own guards reject voiding an
   * invoice with either) — so the literal formula would show a VOID
   * invoice's full totalEtb as "owed", which is wrong on its face. Treating
   * "excluded from the sum" as "contributes zero" here is the same
   * semantics those two call sites already have, not a fourth formula.
   */
  private async withOutstanding(
    tx: TenantTransaction,
    rows: InvoiceRecord[],
  ): Promise<InvoiceListRow[]> {
    if (rows.length === 0) {
      return [];
    }
    const sums = await tx
      .select({
        invoiceId: paymentAllocations.invoiceId,
        total: sum(paymentAllocations.amountEtb),
      })
      .from(paymentAllocations)
      .where(
        inArray(
          paymentAllocations.invoiceId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(paymentAllocations.invoiceId);
    const allocatedById = new Map(sums.map((row) => [row.invoiceId, row.total ?? '0']));

    return rows.map((row) => {
      const allocatedEtb = allocatedById.get(row.id) ?? '0';
      const outstandingEtb =
        row.status === 'VOID'
          ? '0.00'
          : new Decimal(row.totalEtb).minus(row.whtEtb).minus(allocatedEtb).toFixed(2);
      return {
        ...row,
        allocatedEtb: new Decimal(allocatedEtb).toFixed(2),
        outstandingEtb,
      };
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
   * Invoice + lines + joined customer/project display names, for the
   * invoice document download (`invoice` PDF/docx/xlsx template) — same
   * "joined display names + the document's own snapshot columns" shape as
   * ProformasRepository.findByIdForDocument. Two queries (the joined invoice
   * row, then its lines ordered by lineNo) rather than one, mirroring
   * findByIdWithLines above — a single query joining invoice_lines too would
   * duplicate the invoice/customer/project columns once per line.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<InvoiceDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(invoices),
          customerName: customers.name,
          projectName: projects.name,
        })
        .from(invoices)
        .leftJoin(
          customers,
          and(eq(invoices.tenantId, customers.tenantId), eq(invoices.customerId, customers.id)),
        )
        .leftJoin(
          projects,
          and(eq(invoices.tenantId, projects.tenantId), eq(invoices.projectId, projects.id)),
        )
        .where(eq(invoices.id, id))
        .limit(1);
      const invoice = rows[0];
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

      // 3.5 (R4): default the due date from the customer's paymentTermsDays
      // when the caller didn't supply one — see resolveDueDate's own doc
      // comment.
      const resolvedDueDate = await this.resolveDueDate(
        tx,
        proforma.customerId,
        dueDate,
        today,
      );

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
            dueDate: resolvedDueDate,
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

      // Task 3 (3.5): a fresh invoice adds its full totalEtb to what the
      // customer owes — recompute in the same transaction the invoice itself
      // commits in, so the stored balance is never observably stale.
      await recomputeCustomerBalance(tx, tenantId, invoiceRow.customerId);

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

      // R4: default the due date from the customer's paymentTermsDays when
      // the caller didn't supply one — see resolveDueDate's own doc
      // comment. Runs before the insert below, so a non-existent customerId
      // still surfaces as the SAME foreign-key-violation 404 it always has
      // (resolveDueDate degrades to null rather than throwing).
      const resolvedDueDate = await this.resolveDueDate(
        tx,
        input.customerId,
        input.dueDate,
        today,
      );

      let invoiceRow: InvoiceRecord | undefined;
      try {
        [invoiceRow] = await tx
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
            dueDate: resolvedDueDate,
          })
          .returning();
      } catch (err) {
        // customerId/projectId are client-supplied (CreateInvoiceDto) and
        // never pre-validated with a SELECT the way issueFromProforma's own
        // proforma-derived values are — a well-formed but non-existent (or
        // wrong-tenant, or soft-deleted) id would otherwise 500 here.
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Customer or project not found');
        }
        throw err;
      }
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

      // Task 3 (3.5): same reasoning as issueFromProforma's own call below.
      await recomputeCustomerBalance(tx, tenantId, invoiceRow.customerId);

      return { ...invoiceRow, lines };
    });
  }

  /**
   * VOID guard: only from ISSUED, with a net-zero payment allocation
   * balance and no recorded withholding credit. Locked under the SAME
   * per-invoice advisory
   * lock as `recordWithholding` and `PaymentsRepository.guardAndInsertAllocation`
   * — all three race the same invariant (what this invoice's allocations/
   * withholding currently are, and whether it is still safe to write) and
   * must serialize against each other, not just against themselves.
   *
   * A previous version of this method relied on a single UPDATE statement's
   * WHERE clause (CAS on status + NOT EXISTS on allocations) and its doc
   * comment claimed that was atomic enough to need "no separate
   * read-then-write race window". That claim was false: under READ
   * COMMITTED, a concurrent `guardAndInsertAllocation` that has passed its
   * own guards and inserted an allocation — but not yet committed — is
   * invisible to this statement's NOT EXISTS. Both transactions could then
   * commit: this one voiding the invoice, the other attaching a live
   * allocation to it, with the allocation side's own `recomputePaymentStatus`
   * silently no-op'ing once it sees VOID. The result was a VOID invoice
   * with a live allocation permanently attached — cash consumed by a
   * payment that no "what's owed" view (balance, aging) can see anymore.
   * The advisory lock below is what actually closes that window, the same
   * way it closes it for the other two invoice-mutating paths; the CAS/NOT
   * EXISTS shape alone never did.
   *
   * Also rejects voiding an invoice that already carries a recorded
   * withholding credit (whtEtb > 0) — voiding would silently discard the
   * voucher reference (whtVoucherRef/whtRecordedAt) with no path to
   * reconcile it afterward. `whtEtb` can legitimately be corrected back to
   * '0.00' (see `recordWithholding`'s own doc comment), so this check is
   * already "reject only when the EFFECTIVE (current) withholding is
   * non-zero", not "reject once withholding was ever recorded".
   *
   * The allocation guard below (R1) is a NET-ZERO check on Σ amountEtb, not
   * an EXISTENCE check on whether any payment_allocations rows exist. A
   * bounced cheque — the single most common reversal in this market — is
   * reversed via PaymentsRepository.reverse, which mirrors the allocation
   * with a negated row rather than deleting it (immutable ledger). After
   * that, the invoice carries both `+X` and `-X` rows, netting to zero, but
   * still has rows. An existence check would keep such an invoice stuck
   * outstanding forever with no live money attached to it at all; the sum
   * check below is the exact same aggregate `recomputePaymentStatus`
   * already computes a few lines away, so "net-zero" here can never
   * disagree with "fully unpaid" there.
   */
  async voidInvoice(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.lockInvoice(tx, id);

      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.status !== 'ISSUED') {
        throw new WorkflowTransitionError(
          'Invoice can only be voided from ISSUED with a net-zero payment allocation balance',
        );
      }
      if (new Decimal(invoice.whtEtb).gt(0)) {
        throw new WorkflowTransitionError(
          'Cannot void an invoice that already has a recorded withholding credit — voiding would silently discard the voucher reference',
        );
      }
      const [allocated] = await tx
        .select({ total: sum(paymentAllocations.amountEtb) })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, id));
      const allocatedEtb = allocated?.total ?? '0';
      if (!new Decimal(allocatedEtb).isZero()) {
        throw new WorkflowTransitionError(
          'Invoice can only be voided from ISSUED with a net-zero payment allocation balance',
        );
      }

      const [row] = await tx
        .update(invoices)
        .set({ status: 'VOID', voidReason: reason, updatedAt: new Date() })
        .where(eq(invoices.id, id))
        .returning();
      if (!row) {
        throw new Error(`Failed to void invoice ${id}`);
      }

      // Task 3 (3.5): voiding removes this invoice's totalEtb from what
      // the customer owes — recompute in the same transaction the void
      // itself commits in.
      await recomputeCustomerBalance(tx, tenantId, row.customerId);
      return row;
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
   * Records the withholding credit the customer retained when settling this
   * invoice (see the task brief's Ethiopian domestic-withholding
   * background). Guarded under the same per-invoice advisory lock as
   * allocation inserts (PaymentsRepository's guardAllocation) — both write
   * paths race the same invariant (Σ allocations + whtEtb <= totalEtb) and
   * must serialize against each other, not just against themselves.
   *
   * `whtEtb`/`whtVoucherRef`/`whtRecordedAt` are an ABSOLUTE SET, not an
   * increment: re-posting this endpoint corrects the value (the voucher the
   * customer handed over is the source of truth, and a data-entry mistake
   * needs fixing, not adding to). This is safe specifically because these
   * three columns are a *property of the invoice's settlement* evidenced by
   * one external document, not an append-only ledger entry the way
   * `payments`/`payment_allocations` are — there is exactly one correct
   * current value, unlike a running total of many rows.
   *
   * B2 — `amountEtb: '0.00'` is a legal, and the ONLY, way to correct a
   * mis-keyed withholding credit away entirely (WithholdingDto allows it —
   * see its own doc comment for why rejecting zero made the mistake
   * permanent AND made the invoice permanently unvoidable). A zero-set also
   * clears `whtVoucherRef`/`whtRecordedAt` to null: once the credit itself
   * is corrected to nothing, a stale voucher reference pointing at a
   * document that no longer applies to this invoice would be actively
   * misleading, not merely unused.
   */
  async recordWithholding(
    tenantId: string,
    id: string,
    input: { amountEtb: string; voucherRef?: string; recordedAt?: string },
  ): Promise<InvoiceRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await this.lockInvoice(tx, id);

      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.status === 'VOID') {
        throw new WorkflowTransitionError(
          'Cannot record a withholding credit on a VOID invoice',
        );
      }

      const [allocated] = await tx
        .select({ total: sum(paymentAllocations.amountEtb) })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, id));
      const allocatedEtb = allocated?.total ?? '0';
      const settled = new Decimal(allocatedEtb).plus(input.amountEtb);
      if (settled.gt(invoice.totalEtb)) {
        throw new ConflictException(
          `Withholding of ${input.amountEtb} plus the ${allocatedEtb} already allocated would exceed the invoice total of ${invoice.totalEtb}`,
        );
      }

      const isZeroSet = new Decimal(input.amountEtb).isZero();
      const [row] = await tx
        .update(invoices)
        .set({
          whtEtb: input.amountEtb,
          whtVoucherRef: isZeroSet ? null : input.voucherRef ?? null,
          whtRecordedAt: isZeroSet
            ? null
            : input.recordedAt
              ? new Date(input.recordedAt)
              : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();
      if (!row) {
        throw new Error(`Failed to record withholding on invoice ${id}`);
      }

      // recomputePaymentStatus re-reads the invoice (already carrying the
      // whtEtb this UPDATE just committed) and returns EITHER that fresh
      // read (status unchanged) or its own CAS update's row (status
      // changed) — either way the correct, current row. `row` above must
      // NOT be returned as-is: it was captured before this call, so its
      // `status` would still read the pre-withholding value (e.g.
      // PARTIALLY_PAID) even on a withholding credit that just completed
      // settlement to PAID — exactly the kind of stale-view bug this phase
      // exists to catch.
      const settledInvoice = await this.recomputePaymentStatus(tx, id);
      await recomputeCustomerBalance(tx, tenantId, invoice.customerId);

      return settledInvoice;
    });
  }

  /**
   * Per-customer AR aging as of business-time "today": buckets every
   * non-VOID invoice's outstanding amount (totalEtb - whtEtb - Σ
   * allocations, invoices with <= 0 outstanding excluded) by how many days
   * past its dueDate it is. Two plain queries (invoices, then allocation
   * sums) + TS-side bucketing — same "avoid GROUP BY/join subtleties, keep
   * it testable" reasoning as recomputeCustomerBalance.
   *
   * R4 — a null dueDate is bucketed as `current`, NEVER aged from the
   * invoice's own issuedAt. This report used to fall back to issuedAt when
   * dueDate was unset, which put an invoice in `d1_30` the day after it was
   * issued — the finance officer's first screen showing this week's
   * invoices as overdue. Both creation paths (issueFromProforma,
   * createStandalone) now default dueDate from the customer's
   * paymentTermsDays at issue time (see resolveDueDate's own doc comment),
   * so a null dueDate here means the customer had no resolvable terms —
   * treating that as "not yet due" is the only choice that doesn't invent a
   * date this report has no basis for. Every invoice written BEFORE this
   * fix landed also had a null dueDate, for the unrelated, mundane reason
   * that the caller simply omitted it — 0045_backfill_null_due_dates.sql
   * backfilled every such row the same way resolveDueDate computes it
   * (issuedAt's calendar date + the customer's paymentTermsDays) —
   * 0046_fix_due_date_backfill_timezone.sql then corrected 0045 itself: its
   * `issued_at::date` cast used Postgres's session timezone (UTC), not
   * resolveDueDate's Africa/Addis_Ababa business date, one calendar day off
   * for any invoice issued 21:00-23:59 UTC. So this
   * comment's claim holds for every row, not just ones written after R4.
   *
   * IMPORTANT — deliberately PER-INVOICE, unlike `customers.outstandingBalanceEtb`
   * (see `recomputeCustomerBalance`'s doc comment): this report has no
   * unapplied-cash term, because an advance/on-account payment that has not
   * been allocated to any invoice has no invoice to be "aged" against. So
   * this report's total and the customer's net balance will legitimately
   * differ, by exactly that customer's unapplied cash — by design, not a
   * bug. Any UI/export surfacing both must label them distinctly (e.g.
   * "Aged Outstanding" here vs "Net Balance" there).
   */
  async agingReport(tenantId: string): Promise<AgingRow[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();

      const rows = await tx
        .select({
          invoiceId: invoices.id,
          customerId: invoices.customerId,
          customerName: customers.name,
          totalEtb: invoices.totalEtb,
          whtEtb: invoices.whtEtb,
          dueDate: invoices.dueDate,
        })
        .from(invoices)
        .leftJoin(
          customers,
          and(
            eq(invoices.tenantId, customers.tenantId),
            eq(invoices.customerId, customers.id),
          ),
        )
        .where(ne(invoices.status, 'VOID'));
      if (rows.length === 0) {
        return [];
      }

      const allocationSums = await tx
        .select({
          invoiceId: paymentAllocations.invoiceId,
          total: sum(paymentAllocations.amountEtb),
        })
        .from(paymentAllocations)
        .where(
          inArray(
            paymentAllocations.invoiceId,
            rows.map((row) => row.invoiceId),
          ),
        )
        .groupBy(paymentAllocations.invoiceId);
      const allocatedByInvoice = new Map(
        allocationSums.map((row) => [row.invoiceId, row.total ?? '0']),
      );

      const buckets = new Map<
        string,
        {
          customerName: string | null;
          current: Decimal;
          d1_30: Decimal;
          d31_60: Decimal;
          d61_90: Decimal;
          d90_plus: Decimal;
        }
      >();

      for (const row of rows) {
        const allocated = allocatedByInvoice.get(row.invoiceId) ?? '0';
        const outstanding = invoiceOutstandingEtb({
          totalEtb: row.totalEtb,
          whtEtb: row.whtEtb,
          allocatedEtb: allocated,
        });
        if (outstanding.lte(0)) {
          continue;
        }

        // R4: a null dueDate is `current`, full stop — never aged from
        // issuedAt (see this method's own doc comment).
        const bucket =
          row.dueDate === null ? 'current' : bucketForDaysOverdue(daysOverdue(row.dueDate, today));

        let entry = buckets.get(row.customerId);
        if (!entry) {
          entry = {
            customerName: row.customerName,
            current: new Decimal(0),
            d1_30: new Decimal(0),
            d31_60: new Decimal(0),
            d61_90: new Decimal(0),
            d90_plus: new Decimal(0),
          };
          buckets.set(row.customerId, entry);
        }
        entry[bucket] = entry[bucket].plus(outstanding);
      }

      return Array.from(buckets.entries()).map(([customerId, entry]) => ({
        customerId,
        customerName: entry.customerName,
        current: entry.current.toFixed(2),
        d1_30: entry.d1_30.toFixed(2),
        d31_60: entry.d31_60.toFixed(2),
        d61_90: entry.d61_90.toFixed(2),
        d90_plus: entry.d90_plus.toFixed(2),
        total: entry.current
          .plus(entry.d1_30)
          .plus(entry.d31_60)
          .plus(entry.d61_90)
          .plus(entry.d90_plus)
          .toFixed(2),
      }));
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

  /**
   * `pg_advisory_xact_lock(hashtext(id)::bigint)` — see
   * `PaymentsRepository.lockRow` for the same idiom (3rd+ occurrence, reused
   * verbatim per the task brief). Shared here between `voidInvoice` and
   * `recordWithholding`, the two methods in this file that race the same
   * per-invoice invariant, so the lock key derivation can't silently drift
   * between them.
   */
  private async lockInvoice(tx: TenantTransaction, id: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}::text)::bigint)`);
  }

  /**
   * R4: resolves the invoice's dueDate — the caller-supplied value when
   * present, else issueDateIso + the customer's `paymentTermsDays` (both
   * creation paths, `issueFromProforma` and `createStandalone`, call this).
   *
   * Before this fix, an omitted dueDate was stored as a literal NULL and
   * `agingReport` fell back to ageing from the invoice's own `issuedAt` —
   * so an invoice issued today with no due date landed in `d1_30` (overdue)
   * the very next day, regardless of the customer's real payment terms.
   * `customers.paymentTermsDays` (schema default 30) existed but drove
   * nothing.
   *
   * Returns null — never a fabricated date — when the customer can't be
   * resolved (defensive only: both callers already have a working
   * customerId by construction, either FK-validated already or about to be
   * FK-validated by the invoice insert itself). `agingReport` treats a null
   * dueDate as `current`, NEVER as "age from issuedAt" — see its own doc
   * comment for that other half of this fix.
   */
  private async resolveDueDate(
    tx: TenantTransaction,
    customerId: string,
    providedDueDate: string | null,
    issueDateIso: string,
  ): Promise<string | null> {
    if (providedDueDate !== null) {
      return providedDueDate;
    }
    const [customer] = await tx
      .select({ paymentTermsDays: customers.paymentTermsDays })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) {
      return null;
    }
    return addDaysIso(issueDateIso, Number(customer.paymentTermsDays));
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
