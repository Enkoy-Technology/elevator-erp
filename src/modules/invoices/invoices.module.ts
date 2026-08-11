import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { RatesModule } from '../rates/rates.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  // ExportModule for DocumentPdfService/DocumentDocxService/
  // TenantBrandingProvider — the invoice document download (task 5.1) and
  // the aging report's pdf branch (task 5.3) both need them, same reasoning
  // as ProformasModule's own import.
  imports: [RatesModule, ExportModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  // InvoicesRepository (not just the Service) is exported so PaymentsRepository
  // can inject it directly and call recomputePaymentStatus(tx, invoiceId) with
  // its OWN transaction handle — that method is tx-scoped precisely so the
  // allocation insert and the status recompute commit or roll back together
  // (see its own doc comment). Going through InvoicesService instead would mean
  // opening a second transaction, breaking that guarantee — same reasoning as
  // ProformasRepository.issue reading `quotations` directly instead of calling
  // QuotationsRepository's own separately-transacted method.
  exports: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
