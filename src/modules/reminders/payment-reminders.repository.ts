import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, ne, sum } from 'drizzle-orm';

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
}

@Injectable()
export class PaymentReminderRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Non-VOID, due-dated invoices whose days-overdue lands EXACTLY on one of
   * the tenant's configured offsets (default: due date, +7, +30 — task-2
   * brief §2.3) and whose outstanding amount — totalEtb − whtEtb − Σ
   * allocations, the SAME formula `agingReport` uses, imported rather than
   * re-derived (see invoiceOutstandingEtb's own doc comment) — is still
   * greater than zero.
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

      // R4 (invoice-aging.ts): a null dueDate is never "due" — excluded up
      // front by isNotNull, same as agingReport treats it as `current`
      // rather than inventing a date to age from.
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
        })
        .from(invoices)
        .leftJoin(
          customers,
          and(
            eq(invoices.tenantId, customers.tenantId),
            eq(invoices.customerId, customers.id),
          ),
        )
        .where(and(ne(invoices.status, 'VOID'), isNotNull(invoices.dueDate)));

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
        // dueDate is guaranteed non-null by isNotNull() above; the drizzle
        // column type stays nullable, so narrow it explicitly.
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
        });
      }
      return due;
    });
  }
}
