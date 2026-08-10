import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
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
  or,
  sql,
} from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  customers,
  documentSequences,
  proformas,
  projects,
  quotations,
  rateVersions,
  tenants,
  type ProformaStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { ProformaDocumentRow } from './proforma-document.mapper';
import { buildProformaNumber } from './proforma-number';

export type ProformaRecord = typeof proformas.$inferSelect;
export type ProformaInsert = typeof proformas.$inferInsert;

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const PROFORMA_SEQUENCE_KIND = 'PROFORMA';

@Injectable()
export class ProformasRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      projectId?: string;
      status?: ProformaStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProformaRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [];
      if (options.projectId) {
        filters.push(eq(proformas.projectId, options.projectId));
      }
      if (options.status) {
        filters.push(eq(proformas.status, options.status));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [totalRow] = await tx
        .select({ value: count() })
        .from(proformas)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(proformas)
        .where(where)
        .orderBy(desc(proformas.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every proforma matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `createdAt` values (bulk import, seed data) no longer duplicate
   * or skip rows across batch boundaries — concurrent inserts/deletes can
   * still shift the offset window; acceptable for ad-hoc admin downloads,
   * switch to keyset cursor before this feeds accounting reconciliation.
   * Perf ceiling: keyset if large-tenant exports time out.
   */
  async *streamAll(
    tenantId: string,
    options: { projectId?: string; status?: ProformaStatus },
  ): AsyncGenerator<ProformaRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [];
        if (options.projectId) {
          filters.push(eq(proformas.projectId, options.projectId));
        }
        if (options.status) {
          filters.push(eq(proformas.status, options.status));
        }
        const where = filters.length > 0 ? and(...filters) : undefined;
        return tx
          .select()
          .from(proformas)
          .where(where)
          .orderBy(desc(proformas.createdAt), asc(proformas.id))
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

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ProformaRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(proformas)
        .where(eq(proformas.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Same row as findById, plus the customer/project display names — the
   * technicalSpec/pricingBreakdown line data comes straight off this row's
   * own columns (a snapshot copied at issue time, see issue() below), NOT a
   * join back to the live quotation: that quotation can keep changing
   * status after conversion, so a join would render whatever the quotation
   * looks like today instead of what was actually issued. See
   * proforma-document.mapper.ts.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<ProformaDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(proformas),
          customerName: customers.name,
          projectName: projects.name,
        })
        .from(proformas)
        .leftJoin(
          customers,
          and(eq(proformas.tenantId, customers.tenantId), eq(proformas.customerId, customers.id)),
        )
        .leftJoin(
          projects,
          and(eq(proformas.tenantId, projects.tenantId), eq(proformas.projectId, projects.id)),
        )
        .where(eq(proformas.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Issues a proforma from an APPROVED quotation, in ONE tenant transaction:
   * CAS the quotation APPROVED -> CONVERTED_TO_PROFORMA, reject if VAT has
   * rotated since the quotation was priced, claim the next gapless number
   * for (tenant, PROFORMA, fiscal year), insert the immutable money +
   * technicalSpec/pricingBreakdown snapshot. Any failure (CAS miss, stale
   * VAT, missing tenant, insert error) rolls back every write together.
   *
   * Deliberately reads/writes the `quotations` table directly (a shared
   * /database/schema table) instead of composing QuotationsRepository's own
   * (separately-transacted) updateStatus() — that would open a second
   * transaction and break the "all or none" guarantee the brief requires.
   * See task-2-report.md for the transaction-boundary reasoning.
   */
  async issue(
    tenantId: string,
    userId: string,
    quotationId: string,
    validUntil: string | null,
  ): Promise<ProformaRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const today = todayIso(now);

      // 1. CAS the quotation APPROVED -> CONVERTED_TO_PROFORMA.
      const [quote] = await tx
        .update(quotations)
        .set({
          status: 'CONVERTED_TO_PROFORMA',
          statusChangedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(quotations.id, quotationId),
            eq(quotations.status, 'APPROVED'),
            isNull(quotations.deletedAt),
          ),
        )
        .returning();
      if (!quote) {
        const exists = await tx
          .select({ id: quotations.id })
          .from(quotations)
          .where(
            and(eq(quotations.id, quotationId), isNull(quotations.deletedAt)),
          )
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Quotation must be APPROVED to convert to a proforma — it may have already been converted, or changed concurrently',
          );
        }
        throw new NotFoundException('Quotation not found');
      }

      // 1b. VAT staleness guard: reject conversion if the open VAT version
      // has rotated since this quotation was priced (quote.rateVersionId
      // was resolved at quote-creation time — see QuotationsService.
      // createForProject — and never re-resolved). Mirrors RatesRepository.
      // findActive's query shape; read inside this same transaction so the
      // check is consistent with the CAS above.
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
      if (!openVat || openVat.id !== quote.rateVersionId) {
        throw new WorkflowTransitionError(
          'VAT rate has changed since this quotation was priced — re-quote before converting.',
        );
      }

      // 2. Fiscal year for today, from this tenant's configured boundary.
      const [tenant] = await tx
        .select({ fiscalYearStart: tenants.fiscalYearStart })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      const fiscalYear = computeFiscalYear(today, tenant.fiscalYearStart);

      // 3. Claim the next gapless number: a single upsert statement is
      // atomic under Postgres's row-level locking on its own — no advisory
      // lock needed (unlike RatesRepository.rotate()'s read-then-write race).
      const [claimed] = await tx
        .insert(documentSequences)
        .values({
          tenantId,
          kind: PROFORMA_SEQUENCE_KIND,
          fiscalYearLabel: fiscalYear.label,
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
        throw new Error('Failed to claim proforma number');
      }
      const proformaNumber = buildProformaNumber(
        fiscalYear.label,
        claimed.lastValue,
      );

      // 4. Insert the immutable snapshot. subtotalEtb is the TAXABLE BASE —
      // NOT the quotation's pre-margin subtotalEtb, and NOT
      // quote.subtotalEtb + quote.marginAmountEtb either: those are two
      // INDEPENDENTLY-ROUNDED 2dp columns, and summing them can be off by a
      // cent from the full-precision figure VAT was actually computed on
      // (e.g. a true subtotal-with-margin of 126.014 rounds subtotal
      // 100.00 + margin 26.01 = 126.01, while 100.00 + 26.01 itself can
      // land a cent either side of that once each addend was independently
      // rounded first). The one value guaranteed to match what VAT was
      // computed from is quote.pricingBreakdown.subtotalWithMargin itself
      // — see ElevatorCalcService.calculateSpecs (money(subtotalWithMargin),
      // the single rounding point) and QuotationsService.createForProject
      // (taxAmount = D(pricing.subtotalWithMargin).mul(vatPercent).div(100))
      // — so subtotalEtb is copied from there, not re-derived. That's what
      // makes subtotalEtb + vatEtb = totalEtb hold: same source value,
      // never re-summed from already-rounded parts.
      const subtotalWithMargin = (quote.pricingBreakdown as Record<string, unknown> | null)
        ?.subtotalWithMargin;
      if (typeof subtotalWithMargin !== 'string') {
        throw new Error(
          `Quotation ${quote.id} has no pricingBreakdown.subtotalWithMargin — cannot issue a proforma without the value VAT was computed from`,
        );
      }
      let subtotalEtb: string;
      try {
        subtotalEtb = new Decimal(subtotalWithMargin)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toFixed(2);
      } catch {
        throw new Error(
          `Quotation ${quote.id}'s pricingBreakdown.subtotalWithMargin is not a valid decimal: ${JSON.stringify(subtotalWithMargin)}`,
        );
      }

      const [row] = await tx
        .insert(proformas)
        .values({
          tenantId,
          quotationId: quote.id,
          projectId: quote.projectId,
          customerId: quote.customerId,
          proformaNumber,
          fiscalYearLabel: fiscalYear.label,
          subtotalEtb,
          vatEtb: quote.taxAmountEtb,
          totalEtb: quote.totalPriceEtb,
          rateVersionId: quote.rateVersionId,
          technicalSpec: quote.technicalSpec,
          pricingBreakdown: quote.pricingBreakdown,
          issuedByUserId: userId,
          validUntil,
          status: 'ISSUED',
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert proforma');
      }
      return row;
    });
  }

  /**
   * Compare-and-swap ISSUED -> CANCELLED, matching the CAS idiom used
   * throughout (QuotationsRepository.updateStatus, ProjectsRepository.
   * updateStatus). Append-only book: this does NOT touch the source
   * quotation or project — see ProformasService.cancel's doc comment for why
   * that's deliberate.
   */
  async cancel(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<ProformaRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(proformas)
        .set({ status: 'CANCELLED', cancelReason: reason, updatedAt: now })
        .where(and(eq(proformas.id, id), eq(proformas.status, 'ISSUED')))
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: proformas.id })
          .from(proformas)
          .where(eq(proformas.id, id))
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Proforma is not ISSUED — it may already be cancelled',
          );
        }
        throw new NotFoundException('Proforma not found');
      }
      return row;
    });
  }
}
