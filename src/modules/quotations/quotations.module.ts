import { Module } from '@nestjs/common';

import { ElevatorCalcModule } from '../elevator-calc/elevator-calc.module';
import { ProjectsModule } from '../projects/projects.module';
import { RatesModule } from '../rates/rates.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [ElevatorCalcModule, ProjectsModule, RatesModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository],
  exports: [QuotationsService],
})
export class QuotationsModule {}
