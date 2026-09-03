import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, Roles } from '../../common/decorators';
import {
  DocumentPdfService,
  type DocumentTemplate,
} from '../../common/export/document-pdf.service';
import { setDownloadHeaders } from '../../common/export/tabular';
import type { PaymentScheduleTemplateData } from '../../common/export/templates/payment-schedule.template';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ContractInstalmentsService } from './contract-instalments.service';
import { MarkInstalmentInvoicedDto } from './dto/mark-instalment-invoiced.dto';
import { SetContractInstalmentsDto } from './dto/set-instalments.dto';
import { scheduleTotalEtb } from './instalment-schedule';

/**
 * `document-pdf.service.ts` owns the template registry and is edited by hand
 * after this slice lands, so 'payment-schedule' is not a member of
 * `DocumentTemplate` yet. Until `buildPaymentScheduleHtml` is registered
 * there, this endpoint answers with TemplateNotImplementedError — the same
 * behaviour every not-yet-wired template already has. The widening goes away
 * the moment the name joins the union.
 */
const PAYMENT_SCHEDULE_TEMPLATE: DocumentTemplate = 'payment-schedule';

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@Controller()
@Roles('GENERAL_MANAGER', 'SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ContractInstalmentsController {
  constructor(
    private readonly instalmentsService: ContractInstalmentsService,
    private readonly pdfService: DocumentPdfService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Get('contracts/:id/instalments')
  @ApiOperation({ summary: 'The agreed payment schedule for a contract, in sequence order' })
  @ApiOkResponse({ description: 'Instalments, ordered by sequence' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.instalmentsService.list(user, id);
  }

  @Put('contracts/:id/instalments')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary:
      'Set or replace the whole payment schedule (DRAFT contracts only; instalments must total the contract value)',
  })
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetContractInstalmentsDto,
  ) {
    return this.instalmentsService.replaceSchedule(user, id, dto.instalments);
  }

  @Post('contracts/:id/instalments/:instalmentId/invoice')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'FINANCE')
  @ApiOperation({
    summary:
      'Record the invoice raised for one instalment (PENDING -> INVOICED). The invoice is created through the invoices module; this only links it.',
  })
  markInvoiced(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('instalmentId', ParseUUIDPipe) instalmentId: string,
    @Body() dto: MarkInstalmentInvoicedDto,
  ) {
    return this.instalmentsService.markInvoiced(user, id, instalmentId, dto.invoiceId);
  }

  @Get('contracts/:id/payment-schedule')
  @ApiOperation({ summary: 'Download the payment schedule as a PDF for wet signing' })
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const row = await this.instalmentsService.getScheduleForDocument(user, id);
    const data: PaymentScheduleTemplateData = {
      contractNumber: row.contractNumber,
      // A draft has no signature date yet, so it is dated when it was
      // issued — a document with no date at all invites someone to write one in.
      contractDate: row.signedAt ?? row.createdAt,
      status: row.status,
      customerName: row.customerName ?? '—',
      projectName: row.projectName ?? '—',
      contractValueEtb: row.contractValueEtb,
      scheduledTotalEtb: scheduleTotalEtb(row.instalments),
      instalments: row.instalments.map((i) => ({
        sequence: i.sequence,
        label: i.label,
        dueDate: i.dueDate,
        amountEtb: i.amountEtb,
      })),
    };
    const branding = await this.tenantBranding.get(user.tenantId);
    const buf = await this.pdfService.renderDocumentPdf(
      PAYMENT_SCHEDULE_TEMPLATE,
      data,
      branding,
    );
    setDownloadHeaders(
      res,
      `payment-schedule-${row.contractNumber}`,
      'pdf',
      'application/pdf',
    );
    res.end(buf);
  }
}
