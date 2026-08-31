import { Module } from '@nestjs/common';

import { RemindersModule } from '../reminders/reminders.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceRepository } from './maintenance.repository';
import { MaintenanceService } from './maintenance.service';

@Module({
  // RemindersModule for MaintenanceReminderService.notifyBreakdownAssigned —
  // an immediate (not cron) SMS+in-app reminder fired right after a
  // breakdown assignment write (task-2 brief §2.2).
  imports: [RemindersModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceRepository],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
