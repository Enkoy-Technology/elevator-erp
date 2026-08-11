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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, Roles } from '../../common/decorators';
import { DocumentDocxService } from '../../common/export/document-docx.service';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { parseDocumentFormat } from '../../common/export/document-format';
import { setDownloadHeaders } from '../../common/export/tabular';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { PaymentsService } from './payments.service';
import { receiptDocumentData } from './receipt-document.mapper';

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
