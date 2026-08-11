import { Injectable } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  BankTransactionsRepository,
  type BankTransactionListFilter,
  type BankTransactionRecord,
  type UnreconciledView,
} from './bank-transactions.repository';
import type { CreateBankTransactionDto } from './dto/create-bank-transaction.dto';

@Injectable()
export class BankTransactionsService {
  constructor(private readonly bankTransactionsRepository: BankTransactionsRepository) {}

  record(
    user: AuthenticatedUser,
    bankAccountId: string,
    dto: CreateBankTransactionDto,
  ): Promise<BankTransactionRecord> {
    return this.bankTransactionsRepository.record(user.tenantId, user.userId, {
      bankAccountId,
      txDate: dto.txDate,
      amountEtb: dto.amountEtb,
      kind: dto.kind,
      description: dto.description ?? null,
      paymentId: dto.paymentId ?? null,
      expenseId: dto.expenseId ?? null,
    });
  }

  reverse(
    user: AuthenticatedUser,
    bankAccountId: string,
    transactionId: string,
    reason: string,
  ): Promise<BankTransactionRecord> {
    return this.bankTransactionsRepository.reverse(
      user.tenantId,
      bankAccountId,
      transactionId,
      user.userId,
      reason,
    );
  }

  list(
    user: AuthenticatedUser,
    bankAccountId: string,
    options: BankTransactionListFilter & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<BankTransactionRecord>> {
    return this.bankTransactionsRepository.list(user.tenantId, bankAccountId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    bankAccountId: string,
    options: BankTransactionListFilter,
  ): AsyncGenerator<BankTransactionRecord> {
    return this.bankTransactionsRepository.streamAll(user.tenantId, bankAccountId, options);
  }

  findUnreconciled(user: AuthenticatedUser, bankAccountId: string): Promise<UnreconciledView> {
    return this.bankTransactionsRepository.findUnreconciled(user.tenantId, bankAccountId);
  }
}
