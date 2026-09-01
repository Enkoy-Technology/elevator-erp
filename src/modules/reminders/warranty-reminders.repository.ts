import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import {
  warrantyWindow,
  type WarrantyStartBasis,
} from '../../common/export/templates/warranty-certificate.template';
import { contracts, customers } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

/**
 * Days BEFORE expiry the warranty reminder fires. The other two rules read
 * their offsets off a `tenants` column (maintenanceReminderDays,
 * paymentReminderOffsetDays); this one cannot, because the schema for this
 * slice is frozen and adding the column needs a migration.
 *
 * ponytail: constant, not a tenant setting. Promote it to
 * `tenants.warranty_reminder_offset_days` (integer[], same shape and
 * default-fallback read as paymentReminderOffsetDays) the next time a
 * migration lands on this table — nothing else about this rule changes.
 */
export const WARRANTY_REMINDER_OFFSET_DAYS = [30, 7];

export interface DueWarrantyReminder {
  contractId: string;
  contractNumber: string;
  expiresOn: string;
  /** Which contract date the period was computed from — see warrantyWindow. */
  basis: WarrantyStartBasis;
  /** How many days before expiry this reminder is firing. */
  offsetDays: number;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerSmsConsentAt: Date | null;
  customerSmsConsentRevokedAt: Date | null;
}

/**
 * `today` plus `days` calendar days as an ISO 'YYYY-MM-DD' string. Same
 * UTC-midnight arithmetic as maintenance-reminders.repository.ts's own
 * `addDaysIso`; copied rather than shared, per this module's established
 * convention of leaving these three-line date helpers local (see
 * payment-reminders.repository.ts's `subtractDaysIso`). Exported only so
 * the offset boundary is testable without a database.
 */
export const addDaysIso = (fromIso: string, days: number): string => {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

@Injectable()
export class WarrantyReminderRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Contracts whose warranty expires EXACTLY one of the configured offsets
   * out from today.
   *
   * Expiry is computed (start + warrantyMonths), not stored, so it cannot be
   * filtered in SQL the way PaymentReminderRepository filters on dueDate —
   * the offset match happens in JS, against the same `warrantyWindow` the
   * certificate itself prints, so a reminder can never disagree with the
   * paper the customer is holding.
   *
   * ponytail: reads every warranty-bearing contract for the tenant each day.
   * An elevator company signs contracts in the tens per year, so this is a
   * few hundred rows; if a tenant ever grows past a few thousand, store the
   * computed expiry on the row at handover time and filter on it in SQL.
   */
  async listExpiringWarranties(tenantId: string): Promise<DueWarrantyReminder[]> {
    const today = todayIso();
    const expiryToOffset = new Map(
      WARRANTY_REMINDER_OFFSET_DAYS.map((offsetDays) => [
        addDaysIso(today, offsetDays),
        offsetDays,
      ]),
    );

    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          contractId: contracts.id,
          contractNumber: contracts.contractNumber,
          warrantyMonths: contracts.warrantyMonths,
          handedOverAt: contracts.handedOverAt,
          signedAt: contracts.signedAt,
          customerId: contracts.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerSmsConsentAt: customers.smsConsentAt,
          customerSmsConsentRevokedAt: customers.smsConsentRevokedAt,
        })
        .from(contracts)
        .leftJoin(
          customers,
          and(
            eq(contracts.tenantId, customers.tenantId),
            eq(contracts.customerId, customers.id),
          ),
        )
        .where(
          and(
            // A DRAFT was never agreed and a CANCELLED one carries no cover.
            inArray(contracts.status, ['SIGNED', 'COMPLETED']),
            isNotNull(contracts.warrantyMonths),
          ),
        );

      const due: DueWarrantyReminder[] = [];
      for (const row of rows) {
        const warranty = warrantyWindow(row);
        if (!warranty) {
          continue;
        }
        const offsetDays = expiryToOffset.get(warranty.expiresOn);
        if (offsetDays === undefined) {
          continue;
        }
        due.push({
          contractId: row.contractId,
          contractNumber: row.contractNumber,
          expiresOn: warranty.expiresOn,
          basis: warranty.basis,
          offsetDays,
          customerId: row.customerId,
          customerName: row.customerName ?? 'the customer',
          customerPhone: row.customerPhone,
          customerSmsConsentAt: row.customerSmsConsentAt,
          customerSmsConsentRevokedAt: row.customerSmsConsentRevokedAt,
        });
      }
      return due;
    });
  }
}
