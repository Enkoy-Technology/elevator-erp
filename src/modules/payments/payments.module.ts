import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { IdempotencyKeysRepository } from '../../common/idempotency/idempotency-keys.repository';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  // InvoicesModule for InvoicesRepository.recomputePaymentStatus — see
  // InvoicesModule's own export comment for why this is a direct repository
  // injection rather than going through InvoicesService. ExportModule for
  // DocumentPdfService/DocumentDocxService/TenantBrandingProvider — the
  // receipt document download (task 5.2).
  imports: [InvoicesModule, ExportModule],
  controllers: [PaymentsController],
  // IdempotencyInterceptor/IdempotencyKeysRepository: /common has no shared
  // module (see export.module.ts's own doc comment on that convention) —
  // registered directly here so `@UseInterceptors(IdempotencyInterceptor)`
  // on record()/allocate()/reverse() can be dependency-injected. Same
  // registration is repeated in InvoicesModule/ExpensesModule/BanksModule.
  providers: [PaymentsService, PaymentsRepository, IdempotencyKeysRepository, IdempotencyInterceptor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
