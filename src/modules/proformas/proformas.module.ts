import { Module } from '@nestjs/common';

import { ExportModule } from '../../common/export/export.module';
import { ProformasController } from './proformas.controller';
import { ProformasRepository } from './proformas.repository';
import { ProformasService } from './proformas.service';

@Module({
  imports: [ExportModule],
  controllers: [ProformasController],
  providers: [ProformasService, ProformasRepository],
  exports: [ProformasService],
})
export class ProformasModule {}
