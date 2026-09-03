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

import { CurrentUser, Roles } from '../../common/decorators';
import { todayIso } from '../../common/business-time';
import { DocumentPdfService } from '../../common/export/document-pdf.service';
import {
  arrayToAsyncIterable,
  type ColumnDef,
  setDownloadHeaders,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import { parseExportFormat, parseReportFormat } from '../../common/export/export-query.dto';
import { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CustomersService } from './customers.service';
import { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export const STATEMENT_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date', format: 'date' },
  { key: 'kind', header: 'Type' },
  { key: 'reference', header: 'Reference' },
  { key: 'debit', header: 'Debit (ETB)', format: 'money' },
  { key: 'credit', header: 'Credit (ETB)', format: 'money' },
  { key: 'balance', header: 'Balance (ETB)', format: 'money' },
];

// Same shape as CreateRateVersionDto's own DATE_ONLY_RE + IsDateString({strict:true})
// combo (rates.dto.ts) — a regex alone accepts '2026-02-30', so the format
// check below is paired with a real calendar round-trip check.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calendar-strict validation for the `from`/`to` query params — none of the
 * existing list controllers bind `@Query()` to a class-validator DTO (see
 * export-query.dto.ts's own comment), so this follows their established
 * inline-validation-plus-BadRequestException convention instead of adding
 * the first one just for two fields.
 */
function parseCalendarDate(paramName: string, value: string | undefined): string {
  if (!value || !DATE_ONLY_RE.test(value)) {
    throw new BadRequestException(
      `${paramName} is required and must be an ISO date (YYYY-MM-DD)`,
    );
  }
  const roundTrip = new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new BadRequestException(`${paramName} is not a valid calendar date`);
  }
  return value;
}

export const CUSTOMERS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'legalName', header: 'Legal Name' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'alternatePhone', header: 'Alternate Phone' },
  { key: 'addressLine1', header: 'Address Line 1' },
  { key: 'addressLine2', header: 'Address Line 2' },
  { key: 'city', header: 'City' },
  { key: 'region', header: 'Region' },
  { key: 'country', header: 'Country' },
  { key: 'buildingName', header: 'Building Name' },
  { key: 'customerType', header: 'Customer Type' },
  { key: 'creditLimitEtb', header: 'Credit Limit (ETB)', format: 'money' },
  // Net account position (invoices owed minus unapplied cash) — see
  // recomputeCustomerBalance's doc comment. Deliberately NOT "Outstanding
  // Balance", which the aging report's per-invoice total already uses and
  // which legitimately disagrees with this net figure by unapplied cash.
  {
    key: 'outstandingBalanceEtb',
    header: 'Net Balance (ETB)',
    format: 'money',
  },
  { key: 'paymentTermsDays', header: 'Payment Terms (Days)' },
  { key: 'tags', header: 'Tags' },
  { key: 'notes', header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

@ApiTags('customers')
@ApiBearerAuth('access-token')
@Controller('customers')
// Class-level @Roles is the read gate; per-route @Roles below narrows writes.
// CEO and ADMIN bypass both (RolesGuard SUPER_ROLES).
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE', 'DISPATCHER')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly pdfService: DocumentPdfService,
    private readonly tenantBranding: TenantBrandingProvider,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List customers (search + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated customer list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('q') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.customersService.list(user, {
        search,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.customersService.streamAll(user, { search });
    const filename = `customers-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, CUSTOMERS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, CUSTOMERS_EXPORT_COLUMNS, rows);
    }
  }

  @Post('check-duplicate')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary: 'Warn about look-alike customers before create (advisory only)',
  })
  checkDuplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckDuplicateCustomerDto,
  ) {
    return this.customersService.checkDuplicate(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.getById(user, id);
  }

  // No per-route @Roles, because a single role list cannot express what this
  // route needs: it aggregates EIGHT modules, each with its own gate. A
  // dispatcher may see the assets and the maintenance, and must not see the
  // AR ledger that InvoicesController restricts to FINANCE. So the service
  // narrows the response per section, via `visibleSections(user.role)`.
  //
  // Do not "simplify" this to a route-level @Roles: the class gate decides
  // who may ask about a customer at all, and the per-section table decides
  // what comes back. Both are needed.
  @Get(':id/overview')
  @ApiOperation({
    summary:
      "Everything hanging off one customer — projects, quotations, proformas, contracts, invoices, payments, assets and maintenance, each as a full count plus the newest five",
  })
  @ApiOkResponse({ description: 'Customer overview' })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.overview(user, id);
  }

  @Get(':id/statement')
  @Roles('FINANCE')
  @ApiOperation({
    summary:
      'Chronological AR statement between from/to (inclusive) with a running balance, or a CSV/XLSX/PDF export with ?format=',
  })
  @ApiOkResponse({ description: 'Customer statement' })
  async statement(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const from = parseCalendarDate('from', fromRaw);
    const to = parseCalendarDate('to', toRaw);
    if (from > to) {
      throw new BadRequestException('from must not be after to');
    }
    const format = parseReportFormat(formatRaw);

    const result = await this.customersService.statement(user, id, from, to);
    if (!format) {
      res.json(result);
      return;
    }
    const filename = `statement-${result.customerId}-${from}-to-${to}`;
    if (format === 'pdf') {
      const branding = await this.tenantBranding.get(user.tenantId);
      const buf = await this.pdfService.renderDocumentPdf(
        'customer-statement',
        {
          customerName: result.customerName,
          from,
          to,
          openingBalance: result.openingBalance,
          closingBalance: result.closingBalance,
          rows: result.rows,
        },
        branding,
      );
      setDownloadHeaders(res, filename, 'pdf', 'application/pdf');
      res.end(buf);
      return;
    }
    const exportRows = arrayToAsyncIterable(
      result.rows as unknown as Record<string, unknown>[],
    );
    if (format === 'csv') {
      await writeCsv(res, filename, STATEMENT_EXPORT_COLUMNS, exportRows);
    } else {
      await writeXlsx(res, filename, STATEMENT_EXPORT_COLUMNS, exportRows);
    }
  }

  @Post()
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Create customer' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, dto);
  }

  @Patch(':id')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Soft-delete customer' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.customersService.softDelete(user, id);
  }
}
