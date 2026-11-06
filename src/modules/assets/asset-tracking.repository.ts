import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
} from 'drizzle-orm';

import {
  assetChecklistItems,
  assetEvents,
  assets,
  breakdowns,
  customers,
  maintenanceContracts,
  projects,
  users,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { AssetChecklistMark, AssetStatus } from './dto/asset.dto';

type AssetEventKind = (typeof assetEvents.$inferInsert)['kind'];

export interface StatusMove {
  tenantId: string;
  assetId: string;
  from: AssetStatus;
  to: AssetStatus;
  kind: AssetEventKind;
  userId: string;
  note?: string;
}

export interface ChecklistItemPatch {
  mark?: AssetChecklistMark;
  quantity?: string | null;
  note?: string | null;
}

@Injectable()
export class AssetTrackingRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /** Null for a lift that does not exist or was deleted. */
  async findAsset(tenantId: string, id: string) {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ ...getTableColumns(assets), customerName: customers.name })
        .from(assets)
        .leftJoin(
          customers,
          and(
            eq(assets.tenantId, customers.tenantId),
            eq(assets.customerId, customers.id),
          ),
        )
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  listItems(tenantId: string, assetId: string) {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(assetChecklistItems)
        .where(eq(assetChecklistItems.assetId, assetId))
        .orderBy(asc(assetChecklistItems.position)),
    );
  }

  /** Newest first, with the names the page prints. */
  listEvents(tenantId: string, assetId: string) {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: assetEvents.id,
          kind: assetEvents.kind,
          fromStatus: assetEvents.fromStatus,
          toStatus: assetEvents.toStatus,
          customerName: customers.name,
          note: assetEvents.note,
          createdAt: assetEvents.createdAt,
          createdByName: users.fullName,
        })
        .from(assetEvents)
        .leftJoin(
          customers,
          and(
            eq(assetEvents.tenantId, customers.tenantId),
            eq(assetEvents.customerId, customers.id),
          ),
        )
        .leftJoin(
          users,
          and(
            eq(assetEvents.tenantId, users.tenantId),
            eq(assetEvents.createdByUserId, users.id),
          ),
        )
        .where(eq(assetEvents.assetId, assetId))
        .orderBy(desc(assetEvents.createdAt)),
    );
  }

  async countUnmarked(tenantId: string, assetId: string): Promise<number> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ value: count() })
        .from(assetChecklistItems)
        .where(
          and(
            eq(assetChecklistItems.assetId, assetId),
            isNull(assetChecklistItems.mark),
          ),
        );
      return Number(row?.value ?? 0);
    });
  }

  /**
   * Moves the lift only if it is still at `from`, so of two presses of one
   * button the second changes nothing. False means nothing changed.
   */
  async moveStatus(move: StatusMove): Promise<boolean> {
    return this.tenantDb.withTenant(move.tenantId, async (tx) => {
      const [row] = await tx
        .update(assets)
        .set({ status: move.to, updatedAt: new Date() })
        .where(
          and(
            eq(assets.id, move.assetId),
            eq(assets.status, move.from),
            isNull(assets.deletedAt),
          ),
        )
        .returning({ id: assets.id });
      if (!row) {
        return false;
      }
      await tx.insert(assetEvents).values({
        tenantId: move.tenantId,
        assetId: move.assetId,
        kind: move.kind,
        fromStatus: move.from,
        toStatus: move.to,
        note: move.note,
        createdByUserId: move.userId,
      });
      return true;
    });
  }

  async hasMaintenanceRecords(
    tenantId: string,
    assetId: string,
  ): Promise<boolean> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [contract] = await tx
        .select({ id: maintenanceContracts.id })
        .from(maintenanceContracts)
        .where(
          and(
            eq(maintenanceContracts.assetId, assetId),
            isNull(maintenanceContracts.deletedAt),
          ),
        )
        .limit(1);
      if (contract) {
        return true;
      }
      const [breakdown] = await tx
        .select({ id: breakdowns.id })
        .from(breakdowns)
        .where(
          and(eq(breakdowns.assetId, assetId), isNull(breakdowns.deletedAt)),
        )
        .limit(1);
      return Boolean(breakdown);
    });
  }

  async findCustomer(tenantId: string, id: string) {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async findProject(tenantId: string, id: string) {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: projects.id, customerId: projects.customerId })
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async setSoldTo(change: {
    tenantId: string;
    assetId: string;
    customerId: string | null;
    projectId: string | null;
    userId: string;
  }): Promise<void> {
    await this.tenantDb.withTenant(change.tenantId, async (tx) => {
      await tx
        .update(assets)
        .set({
          customerId: change.customerId,
          projectId: change.projectId,
          updatedAt: new Date(),
        })
        .where(and(eq(assets.id, change.assetId), isNull(assets.deletedAt)));
      await tx.insert(assetEvents).values({
        tenantId: change.tenantId,
        assetId: change.assetId,
        kind: 'SOLD_TO',
        customerId: change.customerId,
        createdByUserId: change.userId,
      });
    });
  }

  /** Scoped by lift and row together; null if the row is not on this lift. */
  async updateItem(
    tenantId: string,
    assetId: string,
    itemId: string,
    patch: ChecklistItemPatch,
    userId: string,
  ) {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(assetChecklistItems)
        .set({
          ...patch,
          ...(patch.mark ? { checkedByUserId: userId, checkedAt: now } : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(assetChecklistItems.id, itemId),
            eq(assetChecklistItems.assetId, assetId),
          ),
        )
        .returning();
      return row ?? null;
    });
  }

  /** Touches only unmarked rows, so a Missing marked meanwhile is never lost. */
  async markCaseOk(
    tenantId: string,
    assetId: string,
    caseNo: number,
    userId: string,
  ): Promise<number> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const rows = await tx
        .update(assetChecklistItems)
        .set({
          mark: 'OK',
          checkedByUserId: userId,
          checkedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(assetChecklistItems.assetId, assetId),
            eq(assetChecklistItems.caseNo, caseNo),
            isNull(assetChecklistItems.mark),
          ),
        )
        .returning({ id: assetChecklistItems.id });
      return rows.length;
    });
  }
}
