import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SiteSurveysController } from './site-surveys.controller';
import { SiteSurveysImportService } from './site-surveys-import.service';
import { SiteSurveysRepository } from './site-surveys.repository';
import { SiteSurveysService } from './site-surveys.service';

@Module({
  // NotificationsRepository is exported for exactly this — RemindersModule
  // reaches it the same way.
  imports: [NotificationsModule],
  controllers: [SiteSurveysController],
  providers: [
    SiteSurveysService,
    SiteSurveysImportService,
    SiteSurveysRepository,
  ],
})
export class SiteSurveysModule {}
