import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import {
  assets,
  breakdowns,
  customers,
  maintenanceContracts,
  tenants,
  users,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export interface DueMaintenanceReminder {
  contractId: string;
  nextServiceAt: string;
  assetName: string;
  site: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerSmsConsentAt: Date | null;
  technicianId: string | null;
  technicianPhone: string | null;
  technicianSmsConsentAt: Date | null;
}

export interface BreakdownAssignmentInfo {
  title: string;
  severity: string;
  assetName: string;
  customerName: string;
  assignedUserId: string | null;
  technicianPhone: string | null;
  technicianSmsConsentAt: Date | null;
}

/**
 * `fromIso` + `days` calendar days, as an ISO 'YYYY-MM-DD' string — the same
 * tiny UTC-midnight arithmetic as InvoicesRepository's own `addDaysIso` (2nd
 * occurrence in this codebase; per that file's own "3rd+, extract"
 * convention, not yet worth a shared helper).
 */
function addDaysIso(fromIso: string, days: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive [today, today+windowDays] boundary for "next service falls
 * within the reminder window" (task-2 brief §2.2) — exported so the exact
 * off-by-one behaviour (windowDays out is IN, windowDays+1 is OUT) is
 * unit-testable on its own, without a database. ISO 'YYYY-MM-DD' strings
 * compare correctly with plain `<=`/`>=`, so this is exactly what the SQL
 * `gte`/`lte` filter below encodes too.
 */
export function reminderWindowBounds(
  today: string,
  windowDays: number,
): { from: string; to: string } {
  return { from: today, to: addDaysIso(today, windowDays) };
}

@Injectable()
export class MaintenanceReminderRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Active, non-deleted contracts whose nextServiceAt falls within the
   * tenant's reminder window — today through today+windowDays INCLUSIVE
   * (task-2 brief §2.2's boundary test: exactly windowDays out is included,
   * windowDays+1 is not).
   */
  async listDueContracts(
    tenantId: string,
  ): Promise<{ windowDays: number; contracts: DueMaintenanceReminder[] }> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [tenant] = await tx
        .select({ windowDays: tenants.maintenanceReminderDays })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const windowDays = tenant?.windowDays ?? 3;

      const { from, to } = reminderWindowBounds(todayIso(), windowDays);

      const rows = await tx
        .select({
          contractId: maintenanceContracts.id,
          nextServiceAt: maintenanceContracts.nextServiceAt,
          customerId: maintenanceContracts.customerId,
          assignedUserId: maintenanceContracts.assignedUserId,
          assetName: assets.name,
          buildingName: assets.buildingName,
          locationNotes: assets.locationNotes,
          customerName: customers.name,
          customerCity: customers.city,
          customerPhone: customers.phone,
          customerSmsConsentAt: customers.smsConsentAt,
          technicianPhone: users.phone,
          technicianSmsConsentAt: users.smsConsentAt,
        })
        .from(maintenanceContracts)
        .leftJoin(
          assets,
          and(
            eq(maintenanceContracts.tenantId, assets.tenantId),
            eq(maintenanceContracts.assetId, assets.id),
          ),
        )
        .leftJoin(
          customers,
          and(
            eq(maintenanceContracts.tenantId, customers.tenantId),
            eq(maintenanceContracts.customerId, customers.id),
          ),
        )
        .leftJoin(
          users,
          and(
            eq(maintenanceContracts.tenantId, users.tenantId),
            eq(maintenanceContracts.assignedUserId, users.id),
          ),
        )
        .where(
          and(
            isNull(maintenanceContracts.deletedAt),
            eq(maintenanceContracts.status, 'ACTIVE'),
            gte(maintenanceContracts.nextServiceAt, from),
            lte(maintenanceContracts.nextServiceAt, to),
          ),
        );

      const contracts: DueMaintenanceReminder[] = rows.map((row) => ({
        contractId: row.contractId,
        nextServiceAt: row.nextServiceAt,
        assetName: row.assetName ?? 'the asset',
        site: row.buildingName ?? row.locationNotes ?? row.customerCity ?? null,
        customerId: row.customerId,
        customerName: row.customerName ?? 'the customer',
        customerPhone: row.customerPhone,
        customerSmsConsentAt: row.customerSmsConsentAt,
        technicianId: row.assignedUserId,
        technicianPhone: row.technicianPhone,
        technicianSmsConsentAt: row.technicianSmsConsentAt,
      }));

      return { windowDays, contracts };
    });
  }

  /**
   * Display context for one breakdown's immediate assignment reminder —
   * read fresh (not passed in by the caller) since MaintenanceRepository's
   * own return value has no joined asset/customer names, only their ids.
   */
  async getBreakdownAssignmentInfo(
    tenantId: string,
    breakdownId: string,
  ): Promise<BreakdownAssignmentInfo | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          title: breakdowns.title,
          severity: breakdowns.severity,
          assignedUserId: breakdowns.assignedUserId,
          assetName: assets.name,
          customerName: customers.name,
          technicianPhone: users.phone,
          technicianSmsConsentAt: users.smsConsentAt,
        })
        .from(breakdowns)
        .leftJoin(
          assets,
          and(
            eq(breakdowns.tenantId, assets.tenantId),
            eq(breakdowns.assetId, assets.id),
          ),
        )
        .leftJoin(
          customers,
          and(
            eq(breakdowns.tenantId, customers.tenantId),
            eq(breakdowns.customerId, customers.id),
          ),
        )
        .leftJoin(
          users,
          and(
            eq(breakdowns.tenantId, users.tenantId),
            eq(breakdowns.assignedUserId, users.id),
          ),
        )
        .where(and(eq(breakdowns.id, breakdownId), isNull(breakdowns.deletedAt)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        title: row.title,
        severity: row.severity,
        assignedUserId: row.assignedUserId,
        assetName: row.assetName ?? 'the asset',
        customerName: row.customerName ?? 'the customer',
        technicianPhone: row.technicianPhone,
        technicianSmsConsentAt: row.technicianSmsConsentAt,
      };
    });
  }
}
