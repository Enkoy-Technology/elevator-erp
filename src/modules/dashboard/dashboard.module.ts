import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';

@Module({
  controllers: [DashboardController],
  providers: [DashboardRepository],
})
export class DashboardModule {}
