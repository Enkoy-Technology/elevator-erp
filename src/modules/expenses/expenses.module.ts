import { Module } from '@nestjs/common';

import { IdempotencyKeysRepository } from '../../common/idempotency/idempotency-keys.repository';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { RatesModule } from '../rates/rates.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [RatesModule],
  controllers: [ExpensesController],
  // IdempotencyInterceptor/IdempotencyKeysRepository — see PaymentsModule's
  // own comment on this registration for why it's repeated per-module.
  providers: [
    ExpensesService,
    ExpensesRepository,
    IdempotencyKeysRepository,
    IdempotencyInterceptor,
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}
