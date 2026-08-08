import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  BREAKDOWN_STATUSES,
  CreateBreakdownDto,
  CreateMaintenanceContractDto,
  LogServiceVisitDto,
  MAINTENANCE_CONTRACT_STATUSES,
  UpdateBreakdownDto,
  UpdateMaintenanceContractDto,
  type BreakdownStatus,
  type MaintenanceContractStatus,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('maintenance')
@ApiBearerAuth('access-token')
@Controller('maintenance')
@Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('contracts')
  @ApiOperation({ summary: 'List maintenance contracts' })
  @ApiOkResponse({ description: 'Paginated contracts' })
  listContracts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    if (
      status &&
      !(MAINTENANCE_CONTRACT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(`Invalid status filter: ${status}`);
    }
    return this.maintenanceService.listContracts(user, {
      page,
      pageSize,
      status: status as MaintenanceContractStatus | undefined,
    });
  }

  @Post('contracts')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Create maintenance contract on an asset' })
  createContract(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMaintenanceContractDto,
  ) {
    return this.maintenanceService.createContract(user, dto);
  }

  @Patch('contracts/:id')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Update maintenance contract' })
  updateContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceContractDto,
  ) {
    return this.maintenanceService.updateContract(user, id, dto);
  }

  @Post('contracts/:id/visits')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER')
  @ApiOperation({ summary: 'Log a service visit and advance schedule' })
  logVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogServiceVisitDto,
  ) {
    return this.maintenanceService.logVisit(user, id, dto);
  }

  @Get('contracts/:id/visits')
  @ApiOperation({ summary: 'List visits for a contract (paginated)' })
  listVisits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.maintenanceService.listVisits(user, id, { page, pageSize });
  }

  @Get('breakdowns')
  @ApiOperation({ summary: 'List breakdown tickets' })
  listBreakdowns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    const parsed =
      status && (BREAKDOWN_STATUSES as readonly string[]).includes(status)
        ? (status as BreakdownStatus)
        : undefined;
    return this.maintenanceService.listBreakdowns(user, {
      page,
      pageSize,
      status: parsed,
    });
  }

  @Post('breakdowns')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER')
  @ApiOperation({ summary: 'Open a breakdown ticket' })
  createBreakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBreakdownDto,
  ) {
    return this.maintenanceService.createBreakdown(user, dto);
  }

  @Patch('breakdowns/:id')
  @Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER')
  @ApiOperation({ summary: 'Update breakdown (assign / complete)' })
  updateBreakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBreakdownDto,
  ) {
    return this.maintenanceService.updateBreakdown(user, id, dto);
  }
}
