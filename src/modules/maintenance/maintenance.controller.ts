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
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { parseDocumentFormat } from '../../common/export/document-format';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { MAINTENANCE_REPORT_TEMPLATE } from '../../common/export/templates/maintenance-report.template';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import {
  setDownloadHeaders,
  type ColumnDef,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
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

export const MAINTENANCE_CONTRACTS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'assetName', header: 'Asset' },
  { key: 'customerName', header: 'Customer' },
  { key: 'recurrence', header: 'Recurrence' },
  { key: 'status', header: 'Status' },
  { key: 'startDate', header: 'Start Date', format: 'date' },
  { key: 'nextServiceAt', header: 'Next Service At', format: 'date' },
  { key: 'lastServiceAt', header: 'Last Service At', format: 'date' },
  { key: 'assignedUserId', header: 'Assigned User ID' },
  { key: 'notes', header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

export const BREAKDOWNS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'assetName', header: 'Asset' },
  { key: 'customerName', header: 'Customer' },
  { key: 'title', header: 'Title' },
  { key: 'description', header: 'Description' },
  { key: 'severity', header: 'Severity' },
  { key: 'status', header: 'Status' },
  { key: 'assignedUserId', header: 'Assigned User ID' },
  { key: 'resolvedAt', header: 'Resolved At', format: 'date' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

@ApiTags('maintenance')
@ApiBearerAuth('access-token')
@Controller('maintenance')
@Roles('TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER')
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly pdfService: DocumentPdfService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Get('contracts')
  @ApiOperation({
    summary:
      'List maintenance contracts (status/customerId filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated contracts' })
  async listContracts(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('format') formatRaw?: string,
    // Declared last on purpose: named query params, so HTTP order is
    // irrelevant, and appending keeps existing positional callers compiling.
    @Query('customerId') customerId?: string,
  ): Promise<void> {
    if (
      status &&
      !(MAINTENANCE_CONTRACT_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(`Invalid status filter: ${status}`);
    }
    if (customerId !== undefined && !isUUID(customerId)) {
      throw new BadRequestException('customerId must be a UUID');
    }
    const parsedStatus = status as MaintenanceContractStatus | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.maintenanceService.listContracts(user, {
        page,
        pageSize,
        status: parsedStatus,
        customerId,
      });
      res.json(result);
      return;
    }
    const rows = this.maintenanceService.streamAllContracts(user, {
      status: parsedStatus,
      customerId,
    });
    const filename = `maintenance-contracts-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, MAINTENANCE_CONTRACTS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, MAINTENANCE_CONTRACTS_EXPORT_COLUMNS, rows);
    }
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

  @Get('visits/:id/report')
  @ApiOperation({
    summary:
      'Download the Maintenance Report for a service visit (?format=pdf). Printed for the customer to sign on paper.',
  })
  async visitReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // Shared validator for the shape/message, then narrowed: this document
    // has a PDF builder only — a service record is not a spreadsheet.
    if (parseDocumentFormat(formatRaw) !== 'pdf') {
      throw new BadRequestException(
        'The maintenance report is available as pdf only',
      );
    }
    const data = await this.maintenanceService.getVisitDocumentData(user, id);
    const branding = await this.tenantBranding.get(user.tenantId);
    const buf = await this.pdfService.renderDocumentPdf(
      MAINTENANCE_REPORT_TEMPLATE,
      data,
      branding,
    );
    setDownloadHeaders(
      res,
      `maintenance-report-${id.slice(0, 8)}`,
      'pdf',
      'application/pdf',
    );
    res.end(buf);
  }

  @Get('breakdowns')
  @ApiOperation({
    summary: 'List breakdown tickets, or stream a CSV/XLSX export with ?format=',
  })
  async listBreakdowns(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    if (status && !(BREAKDOWN_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid status filter: ${status}`);
    }
    const parsedStatus = status as BreakdownStatus | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.maintenanceService.listBreakdowns(user, {
        page,
        pageSize,
        status: parsedStatus,
      });
      res.json(result);
      return;
    }
    const rows = this.maintenanceService.streamAllBreakdowns(user, {
      status: parsedStatus,
    });
    const filename = `maintenance-breakdowns-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, BREAKDOWNS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, BREAKDOWNS_EXPORT_COLUMNS, rows);
    }
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
