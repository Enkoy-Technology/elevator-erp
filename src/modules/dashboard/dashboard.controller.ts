import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators';
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
  @ApiOperation({
    summary: 'Pipeline, sales, maintenance and breakdown figures for the home page',
  })
  @ApiOkResponse({ description: 'Aggregated tenant figures' })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardSummary> {
    return this.dashboardRepository.summary(user.tenantId);
  }
}
