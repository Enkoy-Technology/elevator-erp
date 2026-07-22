import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { InstallationController } from './installation.controller';
import { InstallationRepository } from './installation.repository';
import { InstallationService } from './installation.service';

@Module({
  imports: [ProjectsModule],
  controllers: [InstallationController],
  providers: [InstallationService, InstallationRepository],
  exports: [InstallationService],
})
export class InstallationModule {}
