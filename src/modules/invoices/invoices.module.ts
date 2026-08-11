import { Module } from '@nestjs/common';

import { RatesModule } from '../rates/rates.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  // No ExportModule import: unlike ProformasController (which injects
  // DocumentPdfService/DocumentDocxService/TenantBrandingProvider for
  // pdf/docx document downloads), InvoicesController only calls tabular.ts's
  // plain writeCsv/writeXlsx functions and parseExportFormat — none of
  // those are Nest providers, so there's nothing here to inject.
  imports: [RatesModule],
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
