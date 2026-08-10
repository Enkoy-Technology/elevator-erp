import { Module } from '@nestjs/common';

import { ProformasController } from './proformas.controller';
import { ProformasRepository } from './proformas.repository';
import { ProformasService } from './proformas.service';

@Module({
  controllers: [ProformasController],
  providers: [ProformasService, ProformasRepository],
  exports: [ProformasService],
})
export class ProformasModule {}
