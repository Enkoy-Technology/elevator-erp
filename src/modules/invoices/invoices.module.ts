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
  exports: [InvoicesService],
})
export class InvoicesModule {}
