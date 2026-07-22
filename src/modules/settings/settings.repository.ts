import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { tenantBranding } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

export type SettingsRecord = typeof tenantBranding.$inferSelect;

@Injectable()
export class SettingsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async get(tenantId: string): Promise<SettingsRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(tenantBranding).limit(1);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Tenant branding not found');
      }
      return row;
    });
  }

  async update(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(tenantBranding)
        .set({
          ...(dto.primaryColorHex !== undefined
            ? { primaryColorHex: dto.primaryColorHex }
            : {}),
          ...(dto.secondaryColorHex !== undefined
            ? { secondaryColorHex: dto.secondaryColorHex }
            : {}),
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
          ...(dto.stampUrl !== undefined ? { stampUrl: dto.stampUrl } : {}),
          ...(dto.officialAddress !== undefined
            ? { officialAddress: dto.officialAddress }
            : {}),
          ...(dto.contactEmail !== undefined
            ? { contactEmail: dto.contactEmail }
            : {}),
          ...(dto.contactPhone !== undefined
            ? { contactPhone: dto.contactPhone }
            : {}),
          ...(dto.defaultLocale !== undefined
            ? { defaultLocale: dto.defaultLocale }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantBranding.tenantId, tenantId))
        .returning();
      if (!row) {
        throw new NotFoundException('Tenant branding not found');
      }
      return row;
    });
  }
}
