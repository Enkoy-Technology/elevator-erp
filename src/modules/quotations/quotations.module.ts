import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { ElevatorCalcModule } from '../elevator-calc/elevator-calc.module';
import { ProjectsModule } from '../projects/projects.module';
import { RatesModule } from '../rates/rates.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [ElevatorCalcModule, ProjectsModule, RatesModule, ExportModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository],
  exports: [QuotationsService],
})
export class QuotationsModule {}
