import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import type { Response } from 'express';
import { isUUID } from 'class-validator';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import { proformaStatusEnum, type ProformaStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CancelProformaDto } from './dto/cancel-proforma.dto';
import { ConvertToProformaDto } from './dto/convert-to-proforma.dto';
import { ProformasService } from './proformas.service';

const PROFORMA_STATUSES = proformaStatusEnum.enumValues;

export const PROFORMAS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'proformaNumber', header: 'Proforma Number' },
  { key: 'fiscalYearLabel', header: 'Fiscal Year' },
  { key: 'quotationId', header: 'Quotation ID' },
  { key: 'projectId', header: 'Project ID' },
  { key: 'customerId', header: 'Customer ID' },
  { key: 'subtotalEtb', header: 'Subtotal (ETB)', format: 'money' },
  { key: 'vatEtb', header: 'VAT (ETB)', format: 'money' },
  { key: 'totalEtb', header: 'Total (ETB)', format: 'money' },
  { key: 'status', header: 'Status' },
  { key: 'issuedAt', header: 'Issued At', format: 'date' },
  { key: 'issuedByUserId', header: 'Issued By User ID' },
  { key: 'validUntil', header: 'Valid Until', format: 'date' },
  { key: 'cancelReason', header: 'Cancel Reason' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('proformas')
@ApiBearerAuth('access-token')
@Controller()
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ProformasController {
  constructor(private readonly proformasService: ProformasService) {}

  @Post('quotations/:id/convert-to-proforma')
  @HttpCode(201)
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Convert an APPROVED quotation into an issued proforma (CAS + gapless numbering, one transaction)',
  })
  convertToProforma(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertToProformaDto,
  ) {
    return this.proformasService.issueFromQuotation(user, id, dto.validUntil);
  }

  @Get('proformas')
  @ApiOperation({
    summary:
      'List proformas (project/status filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated proforma list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    if (projectId !== undefined && !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }
    if (
      status !== undefined &&
      !(PROFORMA_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${PROFORMA_STATUSES.join(', ')}`,
      );
    }
    const parsedStatus = status as ProformaStatus | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.proformasService.list(user, {
        projectId,
        status: parsedStatus,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.proformasService.streamAll(user, {
      projectId,
      status: parsedStatus,
    });
    const filename = `proformas-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, PROFORMAS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, PROFORMAS_EXPORT_COLUMNS, rows);
    }
  }

  @Get('proformas/:id')
  @ApiOperation({ summary: 'Get proforma by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proformasService.getById(user, id);
  }

  @Post('proformas/:id/cancel')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Cancel an ISSUED proforma with a reason (append-only — does not revert the source quotation)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelProformaDto,
  ) {
    return this.proformasService.cancel(user, id, dto.reason);
  }
}
