import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { users } from '../../../database/schema';
import { TenantDbService } from '../../../database/tenant-db.service';

export type UserRecord = typeof users.$inferSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async findActiveByEmail(
    tenantId: string,
    email: string,
  ): Promise<UserRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.email, email),
            eq(users.isActive, true),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async findActiveById(
    tenantId: string,
    userId: string,
  ): Promise<UserRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.isActive, true),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async setRefreshTokenHash(
    tenantId: string,
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      await tx
        .update(users)
        .set({ refreshTokenHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
  }

  async recordLogin(tenantId: string, userId: string): Promise<void> {
    await this.tenantDb.withTenant(tenantId, async (tx) => {
      await tx
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
  }
}
