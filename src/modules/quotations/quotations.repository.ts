import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, getTableColumns, isNull } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { customers, projects, quotations, type QuoteStatus } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { QuotationDocumentRow } from './quotation-document.mapper';

export type QuotationRecord = typeof quotations.$inferSelect;
export type QuotationInsert = typeof quotations.$inferInsert;

@Injectable()
export class QuotationsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      projectId?: string;
      status?: QuoteStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<QuotationRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(quotations.deletedAt)];
      if (options.projectId) {
        filters.push(eq(quotations.projectId, options.projectId));
      }
      if (options.status) {
        filters.push(eq(quotations.status, options.status));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(quotations)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(quotations)
        .where(where)
        .orderBy(desc(quotations.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<QuotationRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(quotations)
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Same row as findById, plus the customer/project display names the
   * document templates need (QuotationRecord only has customerId/projectId
   * — see quotation-document.mapper.ts). Joined here rather than fetched via
   * ProjectsService/CustomersService: one query, and it keeps the document
   * endpoint from adding a new cross-module service dependency for two
   * display strings.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<QuotationDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(quotations),
          customerName: customers.name,
          projectName: projects.name,
        })
        .from(quotations)
        .leftJoin(
          customers,
          and(eq(quotations.tenantId, customers.tenantId), eq(quotations.customerId, customers.id)),
        )
        .leftJoin(
          projects,
          and(eq(quotations.tenantId, projects.tenantId), eq(quotations.projectId, projects.id)),
        )
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    values: QuotationInsert,
  ): Promise<QuotationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx.insert(quotations).values(values).returning();
      if (!row) {
        throw new Error('Failed to insert quotation');
      }
      return row;
    });
  }

  /**
   * Compare-and-swap, matching the current ProjectsRepository.updateStatus
   * idiom: the update only lands if the quotation is still in
   * `expectedStatus`, so two concurrent transitions cannot both apply. On a
   * miss, distinguishes "someone else already moved it" (409) from "it
   * doesn't exist" (404).
   */
  async updateStatus(
    tenantId: string,
    id: string,
    expectedStatus: QuoteStatus,
    status: QuoteStatus,
    extra: Partial<
      Pick<QuotationInsert, 'approvedByUserId' | 'approvedAt' | 'rejectedReason'>
    > = {},
  ): Promise<QuotationRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(quotations)
        .set({ status, statusChangedAt: now, updatedAt: now, ...extra })
        .where(
          and(
            eq(quotations.id, id),
            eq(quotations.status, expectedStatus),
            isNull(quotations.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: quotations.id })
          .from(quotations)
          .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Quotation status changed concurrently — reload and retry',
          );
        }
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }
}
