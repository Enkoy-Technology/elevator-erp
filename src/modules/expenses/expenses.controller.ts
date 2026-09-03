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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import {
  IDEMPOTENCY_KEY_API_HEADER,
  IdempotencyInterceptor,
} from '../../common/idempotency/idempotency.interceptor';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import {
  expenseCategoryEnum,
  supplyKindEnum,
  type ExpenseCategory,
  type SupplyKind,
} from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ReverseExpenseDto } from './dto/reverse-expense.dto';
import { ExpensesService } from './expenses.service';

const EXPENSE_CATEGORIES = expenseCategoryEnum.enumValues;
const SUPPLY_KINDS = supplyKindEnum.enumValues;

// Same shape as customers.controller.ts's own DATE_ONLY_RE + round-trip
// check, but optional here (from/to are list filters, not a required report
// window) — undefined passes through untouched.
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

export const EXPENSES_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'expenseNumber', header: 'Expense Number' },
  { key: 'fiscalYearLabel', header: 'Fiscal Year' },
  { key: 'category', header: 'Category' },
  { key: 'supplyKind', header: 'Supply Kind' },
  { key: 'supplierName', header: 'Supplier Name' },
  { key: 'supplierTin', header: 'Supplier TIN' },
  { key: 'supplierLicenceOnFile', header: 'Licence On File' },
  { key: 'netAmountEtb', header: 'Net (ETB)', format: 'money' },
  { key: 'vatEtb', header: 'VAT (ETB)', format: 'money' },
  { key: 'amountEtb', header: 'Gross (ETB)', format: 'money' },
  { key: 'whtRatePercent', header: 'WHT Rate (%)' },
  { key: 'whtEtb', header: 'WHT (ETB)', format: 'money' },
  { key: 'netPayableEtb', header: 'Net Payable (ETB)', format: 'money' },
  { key: 'rateVersionId', header: 'Rate Version ID' },
  { key: 'paidVia', header: 'Paid Via' },
  { key: 'bankAccountId', header: 'Bank Account ID' },
  { key: 'expenseDate', header: 'Expense Date', format: 'date' },
  { key: 'description', header: 'Description' },
  { key: 'reference', header: 'Reference' },
  { key: 'status', header: 'Status' },
  { key: 'reversalOfExpenseId', header: 'Reversal Of Expense ID' },
  { key: 'reverseReason', header: 'Reverse Reason' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('expenses')
@ApiBearerAuth('access-token')
@Controller('expenses')
@Roles('GENERAL_MANAGER', 'FINANCE')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_KEY_API_HEADER)
  @ApiOperation({
    summary:
      'Record a supplier expense — server computes VAT split and WHT from the rate table, resolved at expenseDate',
  })
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expensesService.record(user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List expenses (category/supplyKind/from/to/q filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated expense list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('category') category?: string,
    @Query('supplyKind') supplyKind?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    if (category !== undefined && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException(
        `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`,
      );
    }
    if (supplyKind !== undefined && !(SUPPLY_KINDS as readonly string[]).includes(supplyKind)) {
      throw new BadRequestException(`supplyKind must be one of: ${SUPPLY_KINDS.join(', ')}`);
    }
    const from = parseOptionalCalendarDate('from', fromRaw);
    const to = parseOptionalCalendarDate('to', toRaw);
    const filter = {
      category: category as ExpenseCategory | undefined,
      supplyKind: supplyKind as SupplyKind | undefined,
      from,
      to,
      q,
    };

    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.expensesService.list(user, { ...filter, page, pageSize });
      res.json(result);
      return;
    }
    const rows = this.expensesService.streamAll(user, filter);
    const filename = `expenses-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, EXPENSES_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, EXPENSES_EXPORT_COLUMNS, rows);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an expense by id' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.getById(user, id);
  }

  @Post(':id/reverse')
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_KEY_API_HEADER)
  @ApiOperation({
    summary:
      'Reverse an expense: inserts a new mirroring expense with negated amounts (the original is never edited)',
  })
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseExpenseDto,
  ) {
    return this.expensesService.reverse(user, id, dto.reason);
  }
}
