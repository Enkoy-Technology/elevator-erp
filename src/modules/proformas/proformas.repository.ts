import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';

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
          .orderBy(desc(proformas.createdAt))
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
   * Same row as findById, plus the customer/project display names and the
   * originating quotation's line data (technicalSpec, pricingBreakdown,
   * marginPercent, marginAmountEtb, taxPercent) — proformas don't duplicate
   * that jsonb snapshot, so the document template pulls it from the linked
   * quotation. See proforma-document.mapper.ts.
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
          technicalSpec: quotations.technicalSpec,
          pricingBreakdown: quotations.pricingBreakdown,
          marginPercent: quotations.marginPercent,
          marginAmountEtb: quotations.marginAmountEtb,
          taxPercent: quotations.taxPercent,
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
        .leftJoin(
          quotations,
          and(eq(proformas.tenantId, quotations.tenantId), eq(proformas.quotationId, quotations.id)),
        )
        .where(eq(proformas.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Issues a proforma from an APPROVED quotation, in ONE tenant transaction:
   * CAS the quotation APPROVED -> CONVERTED_TO_PROFORMA, claim the next
   * gapless number for (tenant, PROFORMA, fiscal year), insert the immutable
   * money snapshot. Any failure (CAS miss, missing tenant, insert error)
   * rolls back all three writes together.
   *
   * Deliberately reads/writes the `quotations` table directly (a shared
   * /database/schema table) instead of composing QuotationsRepository's own
   * (separately-transacted) updateStatus() — that would open a second
   * transaction and break the "all three or none" guarantee the brief
   * requires. See task-2-report.md for the transaction-boundary reasoning.
   */
  async issue(
    tenantId: string,
    userId: string,
    quotationId: string,
    validUntil: string | null,
  ): Promise<ProformaRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const now = new Date();

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

      // 2. Fiscal year for today, from this tenant's configured boundary.
      const [tenant] = await tx
        .select({ fiscalYearStart: tenants.fiscalYearStart })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      const fiscalYear = computeFiscalYear(todayIso(now), tenant.fiscalYearStart);

      // 3. Claim the next gapless number: a single upsert statement is
      // atomic under Postgres's row-level locking on its own — no advisory
      // lock needed (unlike RatesRepository.rotate()'s read-then-write race).
      const [claimed] = await tx
        .insert(documentSequences)
        .values({
          tenantId,
          kind: PROFORMA_SEQUENCE_KIND,
          fiscalYearLabel: fiscalYear.label,
          nextValue: 1,
        })
        .onConflictDoUpdate({
          target: [
            documentSequences.tenantId,
            documentSequences.kind,
            documentSequences.fiscalYearLabel,
          ],
          set: { nextValue: sql`${documentSequences.nextValue} + 1` },
        })
        .returning({ nextValue: documentSequences.nextValue });
      if (!claimed) {
        throw new Error('Failed to claim proforma number');
      }
      const proformaNumber = buildProformaNumber(
        fiscalYear.label,
        claimed.nextValue,
      );

      // 4. Insert the immutable snapshot.
      const [row] = await tx
        .insert(proformas)
        .values({
          tenantId,
          quotationId: quote.id,
          projectId: quote.projectId,
          customerId: quote.customerId,
          proformaNumber,
          fiscalYearLabel: fiscalYear.label,
          subtotalEtb: quote.subtotalEtb,
          vatEtb: quote.taxAmountEtb,
          totalEtb: quote.totalPriceEtb,
          rateVersionId: quote.rateVersionId,
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
