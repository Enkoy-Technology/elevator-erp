import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { tenantBranding, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

export type SettingsRecord = typeof tenantBranding.$inferSelect & {
  fiscalYearStart: string;
  maintenanceReminderDays: number;
  paymentReminderOffsetDays: number[];
};

const TENANT_SETTINGS_COLUMNS = {
  fiscalYearStart: tenants.fiscalYearStart,
  maintenanceReminderDays: tenants.maintenanceReminderDays,
  paymentReminderOffsetDays: tenants.paymentReminderOffsetDays,
};

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
      const [tenant] = await tx
        .select(TENANT_SETTINGS_COLUMNS)
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      return { ...row, ...tenant };
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

      // Only touch `tenants` (and its updatedAt, which subscription/billing
      // flows also read) when this PATCH actually changes something on it —
      // a branding-only update has no business bumping it.
      const touchesTenant =
        dto.fiscalYearStart !== undefined ||
        dto.maintenanceReminderDays !== undefined ||
        dto.paymentReminderOffsetDays !== undefined;
      const [tenant] = touchesTenant
        ? await tx
            .update(tenants)
            .set({
              ...(dto.fiscalYearStart !== undefined
                ? { fiscalYearStart: dto.fiscalYearStart }
                : {}),
              ...(dto.maintenanceReminderDays !== undefined
                ? { maintenanceReminderDays: dto.maintenanceReminderDays }
                : {}),
              ...(dto.paymentReminderOffsetDays !== undefined
                ? { paymentReminderOffsetDays: dto.paymentReminderOffsetDays }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(tenants.id, tenantId))
            .returning(TENANT_SETTINGS_COLUMNS)
        : await tx
            .select(TENANT_SETTINGS_COLUMNS)
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      return { ...row, ...tenant };
    });
  }
}
