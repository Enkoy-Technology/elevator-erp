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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { isUUID } from 'class-validator';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { DocumentDocxService } from '../../common/export/document-docx.service';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { parseDocumentFormat } from '../../common/export/document-format';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, setDownloadHeaders, writeCsv, writeXlsx } from '../../common/export/tabular';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import { paymentMethodEnum, type PaymentMethod } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { PaymentsService } from './payments.service';
import { receiptDocumentData } from './receipt-document.mapper';

const PAYMENT_METHODS = paymentMethodEnum.enumValues;

// Same shape as expenses.controller.ts's own DATE_ONLY_RE + round-trip
// check — duplicated per this codebase's established "2nd+ occurrence,
// duplicate a controller-local inline validator rather than extract"
// convention (bank-accounts.controller.ts's own copy of this same helper
// carries the identical note).
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseOptionalCalendarDate(
  paramName: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!DATE_ONLY_RE.test(value)) {
    throw new BadRequestException(`${paramName} must be an ISO date (YYYY-MM-DD)`);
  }
  const roundTrip = new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new BadRequestException(`${paramName} is not a valid calendar date`);
  }
  return value;
}

export const PAYMENTS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'receiptNumber', header: 'Receipt Number' },
  { key: 'fiscalYearLabel', header: 'Fiscal Year' },
  { key: 'customerId', header: 'Customer ID' },
  { key: 'customerName', header: 'Customer Name' },
  { key: 'receivedAt', header: 'Received At', format: 'date' },
  { key: 'amountEtb', header: 'Amount (ETB)', format: 'money' },
  { key: 'allocatedEtb', header: 'Allocated (ETB)', format: 'money' },
  { key: 'method', header: 'Method' },
  { key: 'bankAccountId', header: 'Bank Account ID' },
  { key: 'reference', header: 'Reference' },
  { key: 'note', header: 'Note' },
  { key: 'reversalOfPaymentId', header: 'Reversal Of Payment ID' },
  { key: 'reverseReason', header: 'Reverse Reason' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller('payments')
@Roles('FINANCE')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly pdfService: DocumentPdfService,
    private readonly docxService: DocumentDocxService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Record a receipt, optionally allocating it against one or more invoices in the same transaction',
  })
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.record(user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List payments (customerId/method/from/to/q filter + pagination), each with its allocated total, or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated payment list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('customerId') customerId?: string,
    @Query('method') method?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    if (customerId !== undefined && !isUUID(customerId)) {
      throw new BadRequestException('customerId must be a UUID');
    }
    if (method !== undefined && !(PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new BadRequestException(`method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }
    const from = parseOptionalCalendarDate('from', fromRaw);
    const to = parseOptionalCalendarDate('to', toRaw);
    const filter = {
      customerId,
      method: method as PaymentMethod | undefined,
      from,
      to,
      q,
    };

    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.paymentsService.list(user, { ...filter, page, pageSize });
      res.json(result);
      return;
    }
    const rows = this.paymentsService.streamAll(user, filter);
    const filename = `payments-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, PAYMENTS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, PAYMENTS_EXPORT_COLUMNS, rows);
    }
  }

  @Post(':id/allocations')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Allocate an existing payment against an invoice (over-allocation guards apply)',
  })
  allocate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocatePaymentDto,
  ) {
    return this.paymentsService.allocate(user, id, dto);
  }

  @Post(':id/reverse')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Reverse a payment: inserts a new mirroring payment with negated amounts (the original is never edited)',
  })
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePaymentDto,
  ) {
    return this.paymentsService.reverse(user, id, dto.reason);
  }

  @Get(':id/document')
  @ApiOperation({
    summary:
      'Download a payment receipt as PDF or Word (?format=pdf|docx). No xlsx — a receipt is not a table.',
  })
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const format = parseDocumentFormat(formatRaw);
    if (format === 'xlsx') {
      throw new BadRequestException(
        'xlsx is not supported for payment receipts — a receipt is not a table; use pdf or docx',
      );
    }

    const row = await this.paymentsService.getDocumentData(user, id);
    const filename = `receipt-${row.receiptNumber}`;
    const branding = await this.tenantBranding.get(user.tenantId);
    const data = receiptDocumentData(row);

    if (format === 'pdf') {
      const buf = await this.pdfService.renderDocumentPdf('receipt', data, branding);
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    const buf = await this.docxService.renderDocumentDocx('receipt', data, branding);
    setDownloadHeaders(
      res,
      filename,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.end(buf);
  }
}
