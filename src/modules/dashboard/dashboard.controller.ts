import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  DashboardRepository,
  type DashboardSummary,
} from './dashboard.repository';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  @Get('summary')
  // Spec §5.3 Dashboard: every staff role but the warehouse; never a customer login.
  @Roles('GENERAL_MANAGER', 'MARKETING_MANAGER', 'SALES_MANAGER', 'SALESPERSON', 'FINANCE_OFFICER', 'OFFICE_MANAGER', 'TECHNICAL_MANAGER', 'MAINTENANCE_ENGINEER', 'STORE_KEEPER', 'SECRETARY')
  @ApiOperation({
    summary:
      'Pipeline, sales, receivables, maintenance and breakdown figures for the home page',
  })
  @ApiOkResponse({ description: 'Aggregated tenant figures' })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardSummary> {
    return this.dashboardRepository.summary(user.tenantId, user.role);
  }
}
