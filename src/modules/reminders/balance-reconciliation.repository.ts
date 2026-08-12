import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { customers, tenants } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export interface BalanceMismatch {
  customerId: string;
  customerName: string;
  storedEtb: string;
  correctedEtb: string;
}

export interface ReconciliationRunResult {
  customersChecked: number;
  mismatches: BalanceMismatch[];
}

@Injectable()
export class BalanceReconciliationRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Recomputes every non-deleted customer's balance (task-2 brief §2.5, the
   * nightly follow-up `recomputeCustomerBalance`'s own ponytail note
   * promised — see common/customer-balance.ts): reads the STORED value,
   * calls the same recompute-on-write function every other write path
   * already uses, and compares. `recomputeCustomerBalance` always writes the
   * freshly-derived value regardless of whether it matches, so "on
   * mismatch: correct it" is automatic — a non-mismatch is just a harmless
   * rewrite of the same number. The caller (BalanceReconciliationService) is
   * responsible for logging mismatches loudly; this method only reports them.
   *
   * One withTenant transaction PER CUSTOMER, not one giant transaction for
   * the whole tenant — same "small lock scope over one long-running
   * transaction" reasoning as this codebase's other bulk jobs
   * (CustomersRepository.streamAll etc.), and it means a stored-value read
   * that raced a concurrent write between listing and here just sees
   * whatever is currently true, not a stale snapshot from minutes earlier.
   */
  async reconcileAll(tenantId: string): Promise<ReconciliationRunResult> {
    const customerRows = await this.listCustomers(tenantId);
    const mismatches: BalanceMismatch[] = [];

    for (const customer of customerRows) {
      const mismatch = await this.reconcileOne(tenantId, customer.id, customer.name);
      if (mismatch) {
        mismatches.push(mismatch);
      }
    }

    return { customersChecked: customerRows.length, mismatches };
  }

  private async listCustomers(
    tenantId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(isNull(customers.deletedAt))
        .orderBy(asc(customers.id)),
    );
  }

  private async reconcileOne(
    tenantId: string,
    customerId: string,
    customerName: string,
  ): Promise<BalanceMismatch | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ stored: customers.outstandingBalanceEtb })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
        .limit(1);
      if (!row) {
        // Deleted between listCustomers and here — nothing left to reconcile.
        return null;
      }

      const corrected = await recomputeCustomerBalance(tx, tenantId, customerId);
      if (new Decimal(row.stored).equals(corrected)) {
        return null;
      }
      return {
        customerId,
        customerName,
        storedEtb: row.stored,
        correctedEtb: corrected,
      };
    });
  }

  /** Written after every run, matched or not — this is the "somewhere an
   * admin can see it" surface (task-2 §2.5), read back through GET /settings. */
  async recordRunResult(tenantId: string, mismatchCount: number): Promise<void> {
    await this.tenantDb.withTenant(tenantId, (tx) =>
      tx
        .update(tenants)
        .set({
          balanceReconciliationLastRunAt: new Date(),
          balanceReconciliationMismatchCount: mismatchCount,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId)),
    );
  }
}
