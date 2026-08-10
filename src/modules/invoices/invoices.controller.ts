import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import {
  type ColumnDef,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import { invoiceStatusEnum, type InvoiceStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ConvertToInvoiceDto } from './dto/convert-to-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { FiscalMirrorDto } from './dto/fiscal-mirror.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { InvoicesService } from './invoices.service';

const INVOICE_STATUSES = invoiceStatusEnum.enumValues;

export const INVOICES_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'invoiceNumber', header: 'Invoice Number' },
  { key: 'fiscalYearLabel', header: 'Fiscal Year' },
  { key: 'proformaId', header: 'Proforma ID' },
  { key: 'customerId', header: 'Customer ID' },
  { key: 'customerName', header: 'Customer Name' },
  { key: 'projectId', header: 'Project ID' },
  { key: 'subtotalEtb', header: 'Subtotal (ETB)', format: 'money' },
  { key: 'vatEtb', header: 'VAT (ETB)', format: 'money' },
  { key: 'whtEtb', header: 'WHT (ETB)', format: 'money' },
  { key: 'totalEtb', header: 'Total (ETB)', format: 'money' },
  { key: 'status', header: 'Status' },
  { key: 'issuedAt', header: 'Issued At', format: 'date' },
  { key: 'dueDate', header: 'Due Date', format: 'date' },
  { key: 'fiscalReceiptNumber', header: 'Fiscal Receipt Number' },
  { key: 'voidReason', header: 'Void Reason' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('invoices')
@ApiBearerAuth('access-token')
@Controller()
@Roles('FINANCE')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('proformas/:id/convert-to-invoice')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Convert an ISSUED proforma into an issued invoice (VAT guard + gapless numbering, one transaction)',
  })
  convertToInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertToInvoiceDto,
  ) {
    return this.invoicesService.issueFromProforma(user, id, dto.dueDate);
  }

  @Post('invoices')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a standalone invoice (e.g. maintenance billing) — server computes VAT/total',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.createStandalone(user, dto);
  }

  @Get('invoices')
  @ApiOperation({
    summary:
      'List invoices (status/customerId/q filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated invoice list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    if (
      status !== undefined &&
      !(INVOICE_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${INVOICE_STATUSES.join(', ')}`,
      );
    }
    const parsedStatus = status as InvoiceStatus | undefined;
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.invoicesService.list(user, {
        status: parsedStatus,
        customerId,
        q,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.invoicesService.streamAll(user, {
      status: parsedStatus,
      customerId,
      q,
    });
    const filename = `invoices-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, INVOICES_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, INVOICES_EXPORT_COLUMNS, rows);
    }
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by id, with its lines' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.getById(user, id);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Void an ISSUED invoice with a reason (only when it has zero payment allocations)',
  })
  voidInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    return this.invoicesService.voidInvoice(user, id, dto.reason);
  }

  @Patch('invoices/:id/fiscal')
  @ApiOperation({
    summary:
      "Manually mirror the customer's ETR/certified-device receipt onto the five fiscal columns (works on any non-VOID status)",
  })
  patchFiscal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FiscalMirrorDto,
  ) {
    return this.invoicesService.patchFiscal(user, id, dto);
  }
}
