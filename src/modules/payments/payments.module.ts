import { Module } from '@nestjs/common';

import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  // InvoicesModule for InvoicesRepository.recomputePaymentStatus — see
  // InvoicesModule's own export comment for why this is a direct repository
  // injection rather than going through InvoicesService.
  imports: [InvoicesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
