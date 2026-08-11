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
import { isUUID } from 'class-validator';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { DocumentDocxService } from '../../common/export/document-docx.service';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import { parseDocumentFormat } from '../../common/export/document-format';
import { parseExportFormat, parseReportFormat } from '../../common/export/export-query.dto';
import {
  arrayToAsyncIterable,
  type ColumnDef,
  setDownloadHeaders,
  singleRow,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import { buildFiscalStatusText } from '../../common/export/templates/invoice.template';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import { invoiceStatusEnum, type InvoiceStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ConvertToInvoiceDto } from './dto/convert-to-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { FiscalMirrorDto } from './dto/fiscal-mirror.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { WithholdingDto } from './dto/withholding.dto';
import {
  INVOICE_DOCUMENT_COLUMNS,
  invoiceDocumentData,
  withDocumentStatus,
} from './invoice-document.mapper';
import type { InvoiceExportRow } from './invoices.repository';
import { InvoicesService } from './invoices.service';

const INVOICE_STATUSES = invoiceStatusEnum.enumValues;

export const INVOICES_EXPORT_COLUMNS: ColumnDef[] = [
  // Fix-wave-c #5: same compliance rule the single-invoice document export
  // already carries (see invoice.template.ts's own compliance header) —
  // this bulk list export was the only invoice-bearing spreadsheet without
  // it. Leading column, same convention as INVOICE_DOCUMENT_COLUMNS.
  { key: 'documentStatus', header: 'Document Status' },
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

/**
 * Fix-wave-c #5: stamps the same plain-text fiscal notice/mirror
 * (`buildFiscalStatusText`, see invoice.template.ts's own compliance
 * comment) onto each row of the bulk list-export STREAM — mirrors
 * `withDocumentStatus` in invoice-document.mapper.ts, but that one maps a
 * single already-fetched row for the `:id/document` xlsx download; this
 * one has to map lazily, one row at a time, to preserve
 * InvoicesRepository.streamAll's batching instead of collecting the whole
 * export into memory.
 */
async function* withListDocumentStatus(
  rows: AsyncIterable<InvoiceExportRow>,
): AsyncGenerator<InvoiceExportRow & { documentStatus: string }> {
  for await (const row of rows) {
    yield { ...row, documentStatus: buildFiscalStatusText(row) };
  }
}

export const AGING_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'customerId', header: 'Customer ID' },
  { key: 'customerName', header: 'Customer Name' },
  { key: 'current', header: 'Current (ETB)', format: 'money' },
  { key: 'd1_30', header: '1-30 Days (ETB)', format: 'money' },
  { key: 'd31_60', header: '31-60 Days (ETB)', format: 'money' },
  { key: 'd61_90', header: '61-90 Days (ETB)', format: 'money' },
  { key: 'd90_plus', header: '90+ Days (ETB)', format: 'money' },
  // Per-invoice total — deliberately excludes unapplied cash (see
  // InvoicesRepository.agingReport's doc comment). Do not rename this to
  // "Outstanding Balance" — that label is customers.outstandingBalanceEtb's
  // NET position and the two numbers legitimately disagree.
  { key: 'total', header: 'Aged Outstanding Total (ETB)', format: 'money' },
];

@ApiTags('invoices')
@ApiBearerAuth('access-token')
@Controller()
@Roles('FINANCE')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly pdfService: DocumentPdfService,
    private readonly docxService: DocumentDocxService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

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
    if (customerId !== undefined && !isUUID(customerId)) {
      throw new BadRequestException('customerId must be a UUID');
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
    const rows = withListDocumentStatus(
      this.invoicesService.streamAll(user, {
        status: parsedStatus,
        customerId,
        q,
      }),
    );
    const filename = `invoices-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, INVOICES_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, INVOICES_EXPORT_COLUMNS, rows);
    }
  }

  // Registered before 'invoices/:id' — Nest/Express match routes in
  // registration order, and 'aging' would otherwise be swallowed by :id
  // (and 400 on ParseUUIDPipe) if that route were declared first.
  @Get('invoices/aging')
  @ApiOperation({
    summary:
      'AR aging per customer with any outstanding balance (current/1-30/31-60/61-90/90+), or a CSV/XLSX/PDF export with ?format=',
  })
  @ApiOkResponse({ description: 'Per-customer aging buckets' })
  async aging(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const format = parseReportFormat(formatRaw);
    const rows = await this.invoicesService.agingReport(user);
    if (!format) {
      res.json(rows);
      return;
    }
    const filename = `aging-${todayIso()}`;
    if (format === 'pdf') {
      const branding = await this.tenantBranding.get(user.tenantId);
      const buf = await this.pdfService.renderDocumentPdf(
        'aging-report',
        { asOfDate: todayIso(), rows },
        branding,
      );
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    const exportRows = arrayToAsyncIterable(
      rows as unknown as Record<string, unknown>[],
    );
    if (format === 'csv') {
      await writeCsv(res, filename, AGING_EXPORT_COLUMNS, exportRows);
    } else {
      await writeXlsx(res, filename, AGING_EXPORT_COLUMNS, exportRows);
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

  @Get('invoices/:id/document')
  @ApiOperation({
    summary:
      'Download an invoice as PDF, Word, or Excel (?format=pdf|docx|xlsx). Carries the fiscal-status notice/mirror block — see invoice.template.ts.',
  })
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') formatRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const format = parseDocumentFormat(formatRaw);
    const row = await this.invoicesService.getDocumentData(user, id);
    const filename = `invoice-${row.invoiceNumber}`;

    if (format === 'xlsx') {
      // writeXlsx reads row[col.key] at runtime — withDocumentStatus(row)
      // has every field INVOICE_DOCUMENT_COLUMNS references (R6 adds
      // `documentStatus`, the fiscal notice/mirror text, on top); the cast
      // is only needed because InvoiceDocumentRow has no index signature of
      // its own (mirrors ProformasController.document's own cast).
      await writeXlsx(
        res,
        filename,
        INVOICE_DOCUMENT_COLUMNS,
        singleRow(withDocumentStatus(row) as unknown as Record<string, unknown>),
      );
      return;
    }

    const branding = await this.tenantBranding.get(user.tenantId);
    const data = invoiceDocumentData(row);
    if (format === 'pdf') {
      const buf = await this.pdfService.renderDocumentPdf('invoice', data, branding);
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    const buf = await this.docxService.renderDocumentDocx('invoice', data, branding);
    setDownloadHeaders(
      res,
      filename,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.end(buf);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Void an ISSUED invoice with a reason (only when its payment allocations net to zero)',
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

  @Post('invoices/:id/withholding')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Record the withholding credit the customer retained when settling this invoice (absolute set, not cumulative — see WithholdingDto)",
  })
  recordWithholding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithholdingDto,
  ) {
    return this.invoicesService.recordWithholding(user, id, dto);
  }
}
