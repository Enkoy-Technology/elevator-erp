import { Module } from '@nestjs/common';

import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsRepository } from './bank-accounts.repository';
import { BankAccountsService } from './bank-accounts.service';
import { BankTransactionsRepository } from './bank-transactions.repository';
import { BankTransactionsService } from './bank-transactions.service';

@Module({
  controllers: [BankAccountsController],
  providers: [
    BankAccountsService,
    BankAccountsRepository,
    BankTransactionsService,
    BankTransactionsRepository,
  ],
  exports: [BankAccountsService, BankTransactionsService],
})
export class BanksModule {}
