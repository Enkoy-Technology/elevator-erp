import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  // NotificationsRepository is exported (not just the Service) so the
  // reminders module (task-2 brief §2.4) can create system-generated
  // notifications directly with a null createdByUserId — NotificationsService
  // is shaped for the @CurrentUser()-driven controller path only.
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
