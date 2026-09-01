import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { isUUID } from 'class-validator';

import { CurrentUser, Roles } from '../../common/decorators';
import { parseDocumentFormat } from '../../common/export/document-format';
import { DocumentDocxService } from '../../common/export/document-docx.service';
import { DocumentContentProvider } from '../../common/export/document-content.provider';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { TECHNICAL_PROPOSAL_TEMPLATE } from '../../common/export/templates/technical-proposal.template';
import { setDownloadHeaders, singleRow, writeXlsx } from '../../common/export/tabular';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import { quoteStatusEnum, type QuoteStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { PriceQuotationDto } from './dto/price-quotation.dto';
import {
  CreateQuotationLineDto,
  ReorderQuotationLinesDto,
  UpdateQuotationLineDto,
} from './dto/quotation-line.dto';
import { UpdateQuotationTermsDto } from './dto/quotation-terms.dto';
import { RejectQuotationDto } from './dto/reject-quotation.dto';
import {
  QUOTATION_DOCUMENT_COLUMNS,
  quotationDocumentData,
  technicalProposalData,
} from './quotation-document.mapper';
import { QuotationsService } from './quotations.service';

const QUOTE_STATUSES = quoteStatusEnum.enumValues;

@ApiTags('quotations')
@ApiBearerAuth('access-token')
@Controller()
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly pdfService: DocumentPdfService,
    private readonly docxService: DocumentDocxService,
    private readonly tenantBranding: TenantBrandingProvider,
    private readonly documentContent: DocumentContentProvider,
  ) {}

  @Get('quotations')
  @ApiOperation({ summary: 'List quotations (project/status filter + paging)' })
  @ApiOkResponse({ description: 'Paginated quotation list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (projectId !== undefined && !isUUID(projectId)) {
      throw new BadRequestException('projectId must be a UUID');
    }
    if (
      status !== undefined &&
      !(QUOTE_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${QUOTE_STATUSES.join(', ')}`,
      );
    }
    return this.quotationsService.list(user, {
      projectId,
      status: status as QuoteStatus | undefined,
      page,
      pageSize,
    });
  }

  @Get('quotations/:id')
  @ApiOperation({ summary: 'Get quotation by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.getById(user, id);
  }

  @Get('quotations/:id/document')
  @ApiOperation({
    summary:
      'Download a quotation as PDF, Word, or Excel (?format=pdf|docx|xlsx). Allowed at any status, including DRAFT.',
  })
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const format = parseDocumentFormat(formatRaw);
    const row = await this.quotationsService.getDocumentData(user, id);
    const filename = `quotation-${row.quoteNumber}`;

    if (format === 'xlsx') {
      // writeXlsx reads row[col.key] at runtime — row has every field
      // QUOTATION_DOCUMENT_COLUMNS references; the cast is only needed
      // because QuotationDocumentRow has no index signature of its own.
      await writeXlsx(
        res,
        filename,
        QUOTATION_DOCUMENT_COLUMNS,
        singleRow(row as unknown as Record<string, unknown>),
      );
      return;
    }

    // Branding and appendix content are independent reads — issue them
    // together rather than paying two round trips in series.
    const [branding, content] = await Promise.all([
      this.tenantBranding.get(user.tenantId),
      this.documentContent.get(user.tenantId),
    ]);
    const data = quotationDocumentData(row, content);
    if (format === 'pdf') {
      const buf = await this.pdfService.renderDocumentPdf('quotation', data, branding);
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    const buf = await this.docxService.renderDocumentDocx('quotation', data, branding);
    setDownloadHeaders(
      res,
      filename,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.end(buf);
  }

  @Get('quotations/:id/technical-proposal')
  @ApiOperation({
    summary:
      'Download the standalone technical proposal / technical specification sheet (?format=pdf). Same content under either name; carries no pricing.',
  })
  async technicalProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // Reuses the shared validator for the shape/message, then narrows: this
    // document has a PDF builder only — there is no docx renderer and no
    // sensible spreadsheet of a specification sheet.
    if (parseDocumentFormat(formatRaw) !== 'pdf') {
      throw new BadRequestException('The technical proposal is available as pdf only');
    }
    const row = await this.quotationsService.getDocumentData(user, id);
    const branding = await this.tenantBranding.get(user.tenantId);
    const buf = await this.pdfService.renderDocumentPdf(
      // Cast until the builder is registered in document-pdf.service.ts,
      // which is what adds this name to the DocumentTemplate union.
      TECHNICAL_PROPOSAL_TEMPLATE,
      technicalProposalData(row),
      branding,
    );
    setDownloadHeaders(
      res,
      `technical-proposal-${row.quoteNumber}`,
      'pdf',
      'application/pdf',
    );
    res.end(buf);
  }


  // ---------------------------------------------------------------------
  // Line items. Reads are open to the class-level roles; every write is
  // Sales Manager and DRAFT-only (enforced in the repository transaction).
  // ---------------------------------------------------------------------

  @Get('quotations/:id/lines')
  @ApiOperation({
    summary:
      "The quotation's line items in print order. A quotation written before line items existed reads back as the single line its header implies.",
  })
  lines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.listLines(user, id);
  }

  @Post('quotations/:id/lines')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Add a line to a DRAFT quotation. The line is priced by its own calculator run.',
  })
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQuotationLineDto,
  ) {
    return this.quotationsService.addLine(user, id, dto);
  }

  @Post('quotations/:id/lines/reorder')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Set the print order of a DRAFT quotation\'s lines' })
  reorderLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderQuotationLinesDto,
  ) {
    return this.quotationsService.reorderLines(user, id, dto);
  }

  @Patch('quotations/:id/lines/:lineId')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Update one line of a DRAFT quotation. Merged onto the stored spec, then re-priced.',
  })
  updateLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateQuotationLineDto,
  ) {
    return this.quotationsService.updateLine(user, id, lineId, dto);
  }

  @Delete('quotations/:id/lines/:lineId')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Remove a line from a DRAFT quotation and close the gap in the print order',
  })
  removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.quotationsService.removeLine(user, id, lineId);
  }

  // ---------------------------------------------------------------------
  // Negotiated price and commercial terms.
  // ---------------------------------------------------------------------

  @Post('quotations/:id/price')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Price a DRAFT quotation from the round VAT-inclusive total the customer pays. The ex-VAT line, the VAT line, each line amount and the discount are derived from it.',
  })
  price(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PriceQuotationDto,
  ) {
    return this.quotationsService.priceFromGrandTotal(user, id, dto);
  }

  @Post('quotations/:id/approve-discount')
  @HttpCode(200)
  @Roles('CEO', 'FINANCE')
  @ApiOperation({
    summary:
      "Sign off the negotiated discount, as yourself. Only needed when the tenant has set a discount approval threshold and this quotation is over it.",
  })
  approveDiscount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.approveDiscount(user, id);
  }

  @Get('quotations/:id/payment-terms')
  @ApiOperation({ summary: 'The payment schedule the offer states' })
  paymentTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.listPaymentTerms(user, id);
  }

  @Patch('quotations/:id/terms')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary:
      'Set the commercial terms of a DRAFT quotation (reference, delivery, warranty, validity) and optionally replace the payment schedule, whose percentages must total 100.',
  })
  updateTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationTermsDto,
  ) {
    return this.quotationsService.updateTerms(user, id, dto);
  }

  @Post('projects/:projectId/quotations')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Generate a DRAFT quotation from calc for a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotationsService.createForProject(user, projectId, dto);
  }

  @Post('quotations/:id/submit')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Submit a DRAFT quotation for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.submit(user, id);
  }

  @Post('quotations/:id/approve')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Approve a PENDING_APPROVAL quotation (Sales Manager+)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.approve(user, id);
  }

  @Post('quotations/:id/reject')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Reject a PENDING_APPROVAL quotation with a reason' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuotationDto,
  ) {
    return this.quotationsService.reject(user, id, dto.reason);
  }

  @Post('quotations/:id/expire')
  @HttpCode(200)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Expire a DRAFT or PENDING_APPROVAL quotation' })
  expire(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quotationsService.expire(user, id);
  }
}
