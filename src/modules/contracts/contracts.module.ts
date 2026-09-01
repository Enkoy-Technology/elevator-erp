import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { ContractHandoverController } from './contract-handover.controller';
import { ContractHandoverRepository } from './contract-handover.repository';
import { ContractHandoverService } from './contract-handover.service';
import { ContractInstalmentsController } from './contract-instalments.controller';
import { ContractInstalmentsRepository } from './contract-instalments.repository';
import { ContractInstalmentsService } from './contract-instalments.service';
import { ContractsController } from './contracts.controller';
import { ContractsRepository } from './contracts.repository';
import { ContractsService } from './contracts.service';

/**
 * The contract book, plus the two things that hang off a signed agreement:
 * the payment schedule (`contract_instalments`) and the handover that
 * closes it. Three controllers rather than one — they were written as
 * separate slices and Nest routes them onto the same `/contracts` path
 * either way.
 */
@Module({
  imports: [ExportModule],
  controllers: [
    ContractsController,
    ContractInstalmentsController,
    ContractHandoverController,
  ],
  providers: [
    ContractsService,
    ContractsRepository,
    ContractInstalmentsService,
    ContractInstalmentsRepository,
    ContractHandoverService,
    ContractHandoverRepository,
  ],
  exports: [ContractsService],
})
export class ContractsModule {}
