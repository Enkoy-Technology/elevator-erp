import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  customers,
  projects,
  quotations,
  tenantBranding,
  type QuoteStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type QuotationRecord = typeof quotations.$inferSelect;
export type QuotationInsert = typeof quotations.$inferInsert;
export type TenantBrandingRecord = typeof tenantBranding.$inferSelect;

export interface QuotationPdfContext {
  quote: QuotationRecord;
  projectName: string;
  customerName: string;
  branding: TenantBrandingRecord | null;
}

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

  /** Quote + project/customer names + tenant branding in one round trip. */
  async getPdfContext(
    tenantId: string,
    id: string,
  ): Promise<QuotationPdfContext | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          quote: quotations,
          projectName: projects.name,
          customerName: sql<string>`coalesce(${customers.legalName}, ${customers.name})`,
        })
        .from(quotations)
        .innerJoin(
          projects,
          and(
            eq(quotations.tenantId, projects.tenantId),
            eq(quotations.projectId, projects.id),
          ),
        )
        .innerJoin(
          customers,
          and(
            eq(quotations.tenantId, customers.tenantId),
            eq(quotations.customerId, customers.id),
          ),
        )
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .limit(1);
      if (!row) {
        return null;
      }
      const [branding] = await tx.select().from(tenantBranding).limit(1);
      return {
        quote: row.quote,
        projectName: row.projectName,
        customerName: row.customerName,
        branding: branding ?? null,
      };
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: QuoteStatus,
    extra: Partial<
      Pick<
        QuotationInsert,
        | 'approvedByUserId'
        | 'approvedAt'
        | 'rejectedReason'
        | 'proformaAt'
        | 'contractAt'
      >
    > = {},
  ): Promise<QuotationRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(quotations)
        .set({ status, statusChangedAt: now, updatedAt: now, ...extra })
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .returning();
      if (!row) {
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }
}
