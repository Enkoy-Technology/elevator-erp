import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  // ExportModule for DocumentPdfService/TenantBrandingProvider — the
  // customer-statement pdf export (task 5.3).
  imports: [ExportModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository],
  exports: [CustomersService],
})
export class CustomersModule {}
