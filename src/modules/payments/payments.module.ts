import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
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
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
