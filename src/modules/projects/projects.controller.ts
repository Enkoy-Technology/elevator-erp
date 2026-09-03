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
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  PROJECT_STATUSES,
  UpdateProjectStatusDto,
} from './dto/update-project-status.dto';
import { ProjectsService } from './projects.service';

export const PROJECTS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'customerName', header: 'Customer' },
  { key: 'name', header: 'Name' },
  { key: 'code', header: 'Code' },
  { key: 'status', header: 'Status' },
  { key: 'siteAddressLine1', header: 'Site Address Line 1' },
  { key: 'siteAddressLine2', header: 'Site Address Line 2' },
  { key: 'siteCity', header: 'Site City' },
  { key: 'siteRegion', header: 'Site Region' },
  { key: 'siteCountry', header: 'Site Country' },
  { key: 'buildingName', header: 'Building Name' },
  { key: 'quotedAmountEtb', header: 'Quoted Amount (ETB)', format: 'money' },
  {
    key: 'contractAmountEtb',
    header: 'Contract Amount (ETB)',
    format: 'money',
  },
  { key: 'salesRepUserId', header: 'Sales Rep User ID' },
  { key: 'technicalLeadUserId', header: 'Technical Lead User ID' },
  { key: 'projectManagerUserId', header: 'Project Manager User ID' },
  { key: 'expectedStartDate', header: 'Expected Start Date', format: 'date' },
  { key: 'expectedEndDate', header: 'Expected End Date', format: 'date' },
  { key: 'actualStartDate', header: 'Actual Start Date', format: 'date' },
  { key: 'actualEndDate', header: 'Actual End Date', format: 'date' },
  { key: 'statusChangedAt', header: 'Status Changed At', format: 'date' },
  { key: 'wonAt', header: 'Won At', format: 'date' },
  { key: 'notes', header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

@ApiTags('projects')
@ApiBearerAuth('access-token')
@Controller('projects')
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List projects (status/customerId/name-search filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated project list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
    // Declared last on purpose: these are named query params, so order is
    // irrelevant over HTTP, and appending keeps every existing positional
    // caller (controller specs) compiling unchanged.
    @Query('customerId') customerId?: string,
  ): Promise<void> {
    if (
      status !== undefined &&
      !(PROJECT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${PROJECT_STATUSES.join(', ')}`,
      );
    }
    if (customerId !== undefined && !isUUID(customerId)) {
      throw new BadRequestException('customerId must be a UUID');
    }
    const parsedStatus = status as (typeof PROJECT_STATUSES)[number] | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.projectsService.list(user, {
        status: parsedStatus,
        customerId,
        q,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.projectsService.streamAll(user, {
      status: parsedStatus,
      customerId,
      q,
    });
    const filename = `projects-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, PROJECTS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, PROJECTS_EXPORT_COLUMNS, rows);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectsService.getById(user, id);
  }

  @Post()
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Create project/lead (starts at LEAD)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(user, dto);
  }

  @Patch(':id/status')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary: 'Advance or cancel project via status DAG, optionally with the deal value',
  })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(user, id, dto.status, {
      ...(dto.quotedAmountEtb !== undefined
        ? { quotedAmountEtb: dto.quotedAmountEtb }
        : {}),
      ...(dto.contractAmountEtb !== undefined
        ? { contractAmountEtb: dto.contractAmountEtb }
        : {}),
    });
  }
}
