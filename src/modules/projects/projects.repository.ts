import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { projects, type ProjectStatus } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CreateProjectDto } from './dto/create-project.dto';

export type ProjectRecord = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

@Injectable()
export class ProjectsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      status?: ProjectStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProjectRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(projects.deletedAt)];
      if (options.status) {
        filters.push(eq(projects.status, options.status));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(projects)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(projects)
        .where(where)
        .orderBy(desc(projects.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every project matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching — concurrent writes during export can
   * skip/duplicate rows across batch boundaries; acceptable for ad-hoc
   * admin downloads, switch to keyset cursor before this feeds accounting
   * reconciliation. Perf ceiling: keyset if large-tenant exports time out.
   *
   * Tenant-scoping subtlety: `app.tenant_id` is a transaction-local GUC
   * (set by `withTenant`), so each batch opens its own `withTenant`
   * transaction rather than reusing one `tx` across the whole generator.
   */
  async *streamAll(
    tenantId: string,
    options: { status?: ProjectStatus },
  ): AsyncGenerator<ProjectRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [isNull(projects.deletedAt)];
        if (options.status) {
          filters.push(eq(projects.status, options.status));
        }
        return tx
          .select()
          .from(projects)
          .where(and(...filters))
          .orderBy(desc(projects.createdAt))
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
  ): Promise<ProjectRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    createdByUserId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({
          tenantId,
          customerId: dto.customerId,
          name: dto.name,
          code: dto.code,
          siteAddressLine1: dto.siteAddressLine1,
          siteAddressLine2: dto.siteAddressLine2,
          siteCity: dto.siteCity,
          siteRegion: dto.siteRegion,
          siteCountry: dto.siteCountry ?? 'ET',
          buildingName: dto.buildingName,
          salesRepUserId: dto.salesRepUserId,
          notes: dto.notes,
          createdByUserId,
          status: 'LEAD',
          statusChangedAt: new Date(),
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert project');
      }
      return row;
    });
  }

  /**
   * Compare-and-swap: the update only lands if the project is still in
   * `expectedStatus`, so two concurrent transitions cannot both apply.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    expectedStatus: ProjectStatus,
    status: ProjectStatus,
    extra: Partial<
      Pick<ProjectInsert, 'quotedAmountEtb' | 'contractAmountEtb'>
    > = {},
  ): Promise<ProjectRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(projects)
        .set({
          status,
          statusChangedAt: now,
          updatedAt: now,
          ...(status === 'CONTRACT' ? { wonAt: now } : {}),
          ...extra,
        })
        .where(
          and(
            eq(projects.id, id),
            eq(projects.status, expectedStatus),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Project status changed concurrently — reload and retry',
          );
        }
        throw new NotFoundException('Project not found');
      }
      return row;
    });
  }
}
