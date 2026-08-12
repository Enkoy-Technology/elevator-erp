import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { MaintenanceReminderRepository } from './maintenance-reminders.repository';
import { MaintenanceReminderService } from './maintenance-reminders.service';
import { TenantDirectoryService } from './tenant-directory.service';

@Module({
  // OutboxModule for OutboxService.enqueue (task-1 built this specifically
  // for this module to call); NotificationsModule for NotificationsRepository
  // (in-app side of task-2 §2.4). Both are infrastructure/delivery modules,
  // not peer business-domain modules — same shape as PaymentsModule's own
  // import of InvoicesModule for a cross-cutting concern.
  imports: [OutboxModule, NotificationsModule],
  providers: [
    TenantDirectoryService,
    MaintenanceReminderRepository,
    MaintenanceReminderService,
  ],
  // MaintenanceReminderService.notifyBreakdownAssigned is called by
  // MaintenanceService right after a breakdown assignment write, on the
  // same "the module that just wrote a business fact reaches into the
  // side-effect module to react" shape PaymentsModule -> InvoicesModule
  // already uses.
  exports: [MaintenanceReminderService],
})
export class RemindersModule {}
