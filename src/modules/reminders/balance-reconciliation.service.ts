import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BalanceReconciliationRepository } from './balance-reconciliation.repository';
import { TenantDirectoryService } from './tenant-directory.service';

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Task-2 brief §2.5 — the nightly reconciliation `recomputeCustomerBalance`'s
 * own ponytail note (common/customer-balance.ts) deferred to "lands with the
 * Phase 5 scheduler": recompute-on-write can leave `outstandingBalanceEtb`
 * transiently stale when two concurrent writes touch different
 * invoices/payments of the SAME customer (no shared lock between them) — it
 * self-heals on the next write to that customer, but this job is the
 * explicit "assert stored == derived" check that catches it even if no
 * further write ever happens to self-heal it.
 *
 * A mismatch here is a data-integrity ALARM, not routine maintenance — it
 * means recompute-on-write's stated self-healing race actually happened (or
 * something worse did). Logged loudly (ERROR, with both values) on purpose:
 * if this fires regularly, something upstream needs attention, not a
 * shrug.
 */
@Injectable()
export class BalanceReconciliationService {
  private readonly logger = new Logger(BalanceReconciliationService.name);

  constructor(
    private readonly tenantDirectory: TenantDirectoryService,
    private readonly reconciliationRepository: BalanceReconciliationRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runNightlyReconciliation(): Promise<void> {
    const tenantIds = await this.tenantDirectory.listActiveTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await this.reconcileOneTenant(tenantId);
      } catch (err) {
        this.logger.error(
          `Balance reconciliation failed for tenant ${tenantId}: ${errorMessage(err)}`,
        );
      }
    }
  }

  private async reconcileOneTenant(tenantId: string): Promise<void> {
    const { customersChecked, mismatches } =
      await this.reconciliationRepository.reconcileAll(tenantId);

    for (const mismatch of mismatches) {
      // ERROR, not LOG, and both values named explicitly — a data-integrity
      // alarm must be loud (task-2 §2.5), never a routine line among many.
      this.logger.error(
        `Customer balance mismatch corrected: tenant ${tenantId}, customer ` +
          `${mismatch.customerId} (${mismatch.customerName}) — stored ` +
          `${mismatch.storedEtb}, derived ${mismatch.correctedEtb}`,
      );
    }

    await this.reconciliationRepository.recordRunResult(tenantId, mismatches.length);

    this.logger.log(
      `Balance reconciliation for tenant ${tenantId}: ${customersChecked} customers checked, ${mismatches.length} mismatches corrected`,
    );
  }
}
