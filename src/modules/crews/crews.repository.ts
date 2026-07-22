import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import { crews, crewMembers } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type CrewRecord = typeof crews.$inferSelect;
export type CrewMemberRecord = typeof crewMembers.$inferSelect;

@Injectable()
export class CrewsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: { page?: string; pageSize?: string; activeOnly?: boolean },
  ): Promise<PaginatedResult<CrewRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = options.activeOnly
        ? eq(crews.isActive, true)
        : undefined;
      const [totalRow] = await tx
        .select({ value: count() })
        .from(crews)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(crews)
        .where(where)
        .orderBy(asc(crews.name))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  async findById(tenantId: string, id: string): Promise<CrewRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(crews)
        .where(eq(crews.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async create(
    tenantId: string,
    input: { name: string; crewType?: CrewRecord['crewType'] },
  ): Promise<CrewRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(crews)
        .values({
          tenantId,
          name: input.name,
          crewType: input.crewType ?? 'INSTALLATION',
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert crew');
      }
      return row;
    });
  }

  async listMembers(
    tenantId: string,
    crewId: string,
  ): Promise<CrewMemberRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      return tx
        .select()
        .from(crewMembers)
        .where(eq(crewMembers.crewId, crewId))
        .orderBy(asc(crewMembers.createdAt));
    });
  }

  async addMember(
    tenantId: string,
    crewId: string,
    userId: string,
    isLead: boolean,
  ): Promise<CrewMemberRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(crewMembers)
        .values({ tenantId, crewId, userId, isLead })
        .onConflictDoUpdate({
          target: [
            crewMembers.tenantId,
            crewMembers.crewId,
            crewMembers.userId,
          ],
          set: { isLead },
        })
        .returning();
      if (!row) {
        throw new Error('Failed to upsert crew member');
      }
      return row;
    });
  }

  async removeMember(
    tenantId: string,
    crewId: string,
    userId: string,
  ): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .delete(crewMembers)
        .where(
          and(
            eq(crewMembers.crewId, crewId),
            eq(crewMembers.userId, userId),
          ),
        )
        .returning({ userId: crewMembers.userId });
      if (!row) {
        throw new NotFoundException('Crew member not found');
      }
    });
  }
}
