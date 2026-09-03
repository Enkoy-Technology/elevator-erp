import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, Roles } from '../../common/decorators';
import {
  DocumentPdfService,
  type DocumentTemplate,
} from '../../common/export/document-pdf.service';
import { setDownloadHeaders } from '../../common/export/tabular';
import { COMPLETION_CERTIFICATE_TEMPLATE } from '../../common/export/templates/completion-certificate.template';
import { WARRANTY_CERTIFICATE_TEMPLATE } from '../../common/export/templates/warranty-certificate.template';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ContractHandoverService } from './contract-handover.service';
import { HandoverContractDto } from './dto/handover-contract.dto';

/**
 * Handover and the two certificates it unlocks. A second controller on the
 * same `contracts` path rather than more methods on the module's own
 * controller — Nest routes both fine, and it keeps this work additive.
 *
 * PDF only: these are documents to print and wet-sign, not spreadsheets,
 * and neither has a docx builder.
 */
@ApiTags('contracts')
@ApiBearerAuth('access-token')
@Controller('contracts')
@Roles('GENERAL_MANAGER', 'SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class ContractHandoverController {
  constructor(
    private readonly handoverService: ContractHandoverService,
    private readonly pdfService: DocumentPdfService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Post(':id/handover')
  @HttpCode(200)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER', 'TECHNICAL_LEAD')
  @ApiOperation({
    summary:
      'Record the handover of a SIGNED contract (SIGNED -> COMPLETED, advances the project to COMPLETED in the same transaction)',
  })
  handover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoverContractDto,
  ) {
    return this.handoverService.handover(user, id, dto);
  }

  @Get(':id/completion-certificate')
  @ApiOperation({
    summary:
      'Download the Completion Certificate as PDF. 409 until a handover is recorded.',
  })
  async completionCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { contractNumber, data } =
      await this.handoverService.completionCertificateData(user, id);
    await this.sendPdf(user, res, COMPLETION_CERTIFICATE_TEMPLATE, data, `completion-certificate-${contractNumber}`);
  }

  @Get(':id/warranty-certificate')
  @ApiOperation({
    summary:
      'Download the Warranty Certificate as PDF. 409 when the contract carries no warranty period.',
  })
  async warrantyCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { contractNumber, data } =
      await this.handoverService.warrantyCertificateData(user, id);
    await this.sendPdf(user, res, WARRANTY_CERTIFICATE_TEMPLATE, data, `warranty-certificate-${contractNumber}`);
  }

  private async sendPdf(
    user: AuthenticatedUser,
    res: Response,
    template: DocumentTemplate,
    data: object,
    filename: string,
  ): Promise<void> {
    const branding = await this.tenantBranding.get(user.tenantId);
    const buf = await this.pdfService.renderDocumentPdf(template, data, branding);
    setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
    res.end(buf);
  }
}
