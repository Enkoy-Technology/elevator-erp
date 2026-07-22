import { Module } from '@nestjs/common';

import { CrewsController } from './crews.controller';
import { CrewsRepository } from './crews.repository';
import { CrewsService } from './crews.service';

@Module({
  controllers: [CrewsController],
  providers: [CrewsService, CrewsRepository],
  exports: [CrewsService],
})
export class CrewsModule {}
