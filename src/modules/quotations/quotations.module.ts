import { Module } from '@nestjs/common';

import { ElevatorCalcModule } from '../elevator-calc/elevator-calc.module';
import { ProjectsModule } from '../projects/projects.module';
import { QuotePdfService } from './quote-pdf.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [ElevatorCalcModule, ProjectsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository, QuotePdfService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
