import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { asc, count, eq, inArray, sum } from 'drizzle-orm';

import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import type { TenantTransaction } from '../../database/database.types';
import { bankAccounts, bankTransactions } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';

export type BankAccountRecord = typeof bankAccounts.$inferSelect;
/** `balanceEtb` (= Σ signed bank_transactions.amountEtb for the account) is
 * computed on every read, never stored — same "derivable, storing invites
 * drift" reasoning as ExpensesRepository's netPayableEtb. */
export type BankAccountWithBalance = BankAccountRecord & { balanceEtb: string };

export interface CreateBankAccountInput {
  name: string;
  bankName: string;
  accountNumber: string;
}

export interface UpdateBankAccountInput {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  isActive?: boolean;
}

const ZERO_BALANCE = '0.00';

@Injectable()
export class BankAccountsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async create(
    tenantId: string,
    input: CreateBankAccountInput,
  ): Promise<BankAccountWithBalance> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(bankAccounts)
        .values({ tenantId, ...input })
        .returning();
      if (!row) {
        throw new Error('Failed to create bank account');
      }
      // A brand-new account has no bank_transactions rows yet — skip the
      // aggregate query, it can only ever return 0.
      return { ...row, balanceEtb: ZERO_BALANCE };
    });
  }

  /**
   * Deactivating an account with a non-zero balance is allowed — no
   * warning field (brief 4.4: "keep it lazy"). `isActive` is just another
   * patchable column.
   */
  async update(
    tenantId: string,
    id: string,
    patch: UpdateBankAccountInput,
  ): Promise<BankAccountWithBalance> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(bankAccounts)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.bankName !== undefined ? { bankName: patch.bankName } : {}),
          ...(patch.accountNumber !== undefined
            ? { accountNumber: patch.accountNumber }
            : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Bank account not found');
      }
      const balanceEtb = await this.balanceFor(tx, row.id);
      return { ...row, balanceEtb };
    });
  }

  /**
   * Lists bank accounts with each one's balance (Σ signed
   * bank_transactions.amountEtb) — brief 4.4 REQUIRES this to be ONE
   * aggregate query for the whole page, never a query per account (N+1).
   * So: page the accounts first (1 query), THEN a single grouped SUM query
   * scoped to just that page's account ids (1 more query) — total query
   * count never grows with page size, only with the number of distinct
   * pages fetched.
   */
  async list(
    tenantId: string,
    options: { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<BankAccountWithBalance>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [totalRow] = await tx.select({ value: count() }).from(bankAccounts);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(bankAccounts)
        .orderBy(asc(bankAccounts.name), asc(bankAccounts.id))
        .limit(pageSize)
        .offset(offset);
      if (items.length === 0) {
        return toPaginatedResult([], total, page, pageSize);
      }

      // The one aggregate query for the whole page — see this method's own
      // doc comment. Never looped per account.
      const balanceRows = await tx
        .select({
          bankAccountId: bankTransactions.bankAccountId,
          balance: sum(bankTransactions.amountEtb),
        })
        .from(bankTransactions)
        .where(
          inArray(
            bankTransactions.bankAccountId,
            items.map((row) => row.id),
          ),
        )
        .groupBy(bankTransactions.bankAccountId);
      const balanceByAccount = new Map(
        balanceRows.map((row) => [row.bankAccountId, row.balance]),
      );

      const withBalance = items.map((row) => ({
        ...row,
        balanceEtb: new Decimal(balanceByAccount.get(row.id) ?? '0').toFixed(2),
      }));
      return toPaginatedResult(withBalance, total, page, pageSize);
    });
  }

  /** Single-account balance — fine as its own query here (single-row reads never hit the N+1 concern list() guards against). */
  private async balanceFor(tx: TenantTransaction, accountId: string): Promise<string> {
    const [row] = await tx
      .select({ balance: sum(bankTransactions.amountEtb) })
      .from(bankTransactions)
      .where(eq(bankTransactions.bankAccountId, accountId));
    return new Decimal(row?.balance ?? '0').toFixed(2);
  }
}
