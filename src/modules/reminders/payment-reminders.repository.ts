import { Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, sum } from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { customers, invoices, paymentAllocations, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { daysOverdue, invoiceOutstandingEtb } from '../invoices/invoice-aging';

const DEFAULT_OFFSET_DAYS = [0, 7, 30];

export interface DuePaymentReminder {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string;
  outstandingEtb: string;
  offsetDays: number;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerSmsConsentAt: Date | null;
  customerSmsConsentRevokedAt: Date | null;
}

/**
 * `today` minus `days` calendar days, as an ISO 'YYYY-MM-DD' string — the
 * negative-direction sibling of maintenance-reminders.repository.ts's own
 * `addDaysIso` (2nd occurrence of this exact UTC-midnight arithmetic in this
 * module; per this codebase's own "2nd occurrence, duplicate; 3rd+,
 * extract" convention, not yet worth a shared helper).
 */
function subtractDaysIso(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class PaymentReminderRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Non-VOID invoices whose due date is EXACTLY one of the tenant's
   * configured offsets out from today (default: due date, +7, +30 —
   * task-2 brief §2.3) and whose outstanding amount — totalEtb − whtEtb − Σ
   * allocations, the SAME formula `agingReport` uses, imported rather than
   * re-derived (see invoiceOutstandingEtb's own doc comment) — is still
   * greater than zero.
   *
   * Bounded by `inArray(invoices.dueDate, candidateDueDates)` (phase-5
   * review I9) rather than scanning every non-VOID due-dated invoice this
   * tenant has ever issued and filtering offsets in JS afterwards: at most
   * `paymentReminderOffsetDays.length` (≤12, DTO-capped) candidate dates,
   * computed once from `today`, so the invoice count returned scales with
   * "how many are due today" instead of "how many invoices this tenant has
   * ever raised" — which is also what keeps the allocation query's
   * `inArray(paymentAllocations.invoiceId, ...)` below under Postgres's
   * 65535 bind-parameter cap.
   */
  async listDueInvoices(tenantId: string): Promise<DuePaymentReminder[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [tenant] = await tx
        .select({ offsets: tenants.paymentReminderOffsetDays })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const offsetSet = new Set(tenant?.offsets ?? DEFAULT_OFFSET_DAYS);

      const today = todayIso();
      // offsetDays = daysOverdue(dueDate, today) = today − dueDate, so the
      // due date a given offset corresponds to is today − offsetDays.
      const candidateDueDates = [...offsetSet].map((offsetDays) =>
        subtractDaysIso(today, offsetDays),
      );

      const rows = await tx
        .select({
          invoiceId: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          dueDate: invoices.dueDate,
          totalEtb: invoices.totalEtb,
          whtEtb: invoices.whtEtb,
          customerId: invoices.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerSmsConsentAt: customers.smsConsentAt,
          customerSmsConsentRevokedAt: customers.smsConsentRevokedAt,
        })
        .from(invoices)
        .leftJoin(
          customers,
          and(
            eq(invoices.tenantId, customers.tenantId),
            eq(invoices.customerId, customers.id),
          ),
        )
        .where(
          and(
            ne(invoices.status, 'VOID'),
            inArray(invoices.dueDate, candidateDueDates),
          ),
        );

      if (rows.length === 0) {
        return [];
      }

      const allocationSums = await tx
        .select({
          invoiceId: paymentAllocations.invoiceId,
          total: sum(paymentAllocations.amountEtb),
        })
        .from(paymentAllocations)
        .where(
          inArray(
            paymentAllocations.invoiceId,
            rows.map((row) => row.invoiceId),
          ),
        )
        .groupBy(paymentAllocations.invoiceId);
      const allocatedByInvoice = new Map(
        allocationSums.map((row) => [row.invoiceId, row.total ?? '0']),
      );

      const due: DuePaymentReminder[] = [];
      for (const row of rows) {
        // dueDate is guaranteed non-null — it matched candidateDueDates
        // (all real ISO strings) in the inArray filter above — but the
        // drizzle column type stays nullable, so narrow it explicitly.
        if (!row.dueDate) {
          continue;
        }
        const allocated = allocatedByInvoice.get(row.invoiceId) ?? '0';
        const outstanding = invoiceOutstandingEtb({
          totalEtb: row.totalEtb,
          whtEtb: row.whtEtb,
          allocatedEtb: allocated,
        });
        if (outstanding.lte(0)) {
          continue;
        }

        // Should already be guaranteed by the inArray filter above (every
        // returned row.dueDate is one of candidateDueDates, and
        // daysOverdue is subtractDaysIso's exact inverse) — kept as a
        // defense-in-depth re-check rather than dropped as "dead": it's
        // what makes the offset-matching behaviour itself unit-testable
        // without a live Postgres to actually evaluate the inArray clause.
        const offsetDays = daysOverdue(row.dueDate, today);
        if (!offsetSet.has(offsetDays)) {
          continue;
        }

        due.push({
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
          dueDate: row.dueDate,
          outstandingEtb: outstanding.toFixed(2),
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

  /**
   * Written after every run, matched or not — the "somewhere an admin can
   * see it" surface (task-3 brief §3.4: "12 reminders not sent — no consent
   * on file" must be visible, not silent), read back through GET /settings.
   * Mirrors BalanceReconciliationRepository.recordRunResult's own pattern.
   * `invalidPhoneSkipped` (I4) is the OTHER reason a reminder silently never
   * arrives — see MaintenanceReminderRepository.recordRunResult's identical
   * doc comment.
   */
  async recordRunResult(
    tenantId: string,
    consentSkipped: number,
    invalidPhoneSkipped: number,
  ): Promise<void> {
    await this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .update(tenants)
        .set({
          paymentReminderConsentSkippedLastRunAt: new Date(),
          paymentReminderConsentSkippedCount: consentSkipped,
          paymentReminderInvalidPhoneSkippedCount: invalidPhoneSkipped,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId)),
    );
  }
}
