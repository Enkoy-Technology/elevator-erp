import { Module } from '@nestjs/common';

import { IdempotencyKeysRepository } from '../../common/idempotency/idempotency-keys.repository';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsRepository } from './bank-accounts.repository';
import { BankAccountsService } from './bank-accounts.service';
import { BankTransactionsRepository } from './bank-transactions.repository';
import { BankTransactionsService } from './bank-transactions.service';

@Module({
  controllers: [BankAccountsController],
  // IdempotencyInterceptor/IdempotencyKeysRepository — see PaymentsModule's
  // own comment on this registration for why it's repeated per-module.
  providers: [
    BankAccountsService,
    BankAccountsRepository,
    BankTransactionsService,
    BankTransactionsRepository,
    IdempotencyKeysRepository,
    IdempotencyInterceptor,
  ],
  exports: [BankAccountsService, BankTransactionsService],
})
export class BanksModule {}
