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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { BankAccountsService } from './bank-accounts.service';
import { BankTransactionsService } from './bank-transactions.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateBankTransactionDto } from './dto/create-bank-transaction.dto';
import { ReverseBankTransactionDto } from './dto/reverse-bank-transaction.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

// Same shape as expenses.controller.ts's own DATE_ONLY_RE + round-trip
// check — duplicated per this codebase's own "3rd+ occurrence" reuse rule
// rather than extracted, see BankTransactionsRepository.isUniqueViolation's
// doc comment for the same convention applied to a different helper.
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

export const BANK_TRANSACTIONS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'bankAccountId', header: 'Bank Account ID' },
  { key: 'txDate', header: 'Transaction Date', format: 'date' },
  { key: 'amountEtb', header: 'Amount (ETB)', format: 'money' },
  { key: 'kind', header: 'Kind' },
  { key: 'description', header: 'Description' },
  { key: 'paymentId', header: 'Payment ID' },
  { key: 'expenseId', header: 'Expense ID' },
  { key: 'recordedByUserId', header: 'Recorded By User ID' },
  // R9 — same "reversal is visible in the export" convention as
  // PaymentsController/ExpensesController's own reversalOf*/reverseReason
  // columns.
  { key: 'reversalOfTransactionId', header: 'Reversal Of Transaction ID' },
  { key: 'reverseReason', header: 'Reverse Reason' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('bank-accounts')
@ApiBearerAuth('access-token')
@Controller('bank-accounts')
@Roles('FINANCE')
export class BankAccountsController {
  constructor(
    private readonly bankAccountsService: BankAccountsService,
    private readonly bankTransactionsService: BankTransactionsService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a bank account' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List bank accounts (paginated), each with its computed balanceEtb',
  })
  @ApiOkResponse({ description: 'Paginated bank account list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bankAccountsService.list(user, { page, pageSize });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a bank account (name/bankName/accountNumber/isActive)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankAccountsService.update(user, id, dto);
  }

  @Post(':id/transactions')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Record one bank ledger line for this account — insert-only, no edit/delete endpoint exists',
  })
  recordTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBankTransactionDto,
  ) {
    return this.bankTransactionsService.record(user, id, dto);
  }

  @Post(':id/transactions/:txId/reverse')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Reverse an UNLINKED bank transaction: inserts a new mirroring row with the negated amount (the original is never edited). Refuses (409) a transaction linked to a payment or expense — reverse that payment/expense instead',
  })
  reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('txId', ParseUUIDPipe) txId: string,
    @Body() dto: ReverseBankTransactionDto,
  ) {
    return this.bankTransactionsService.reverse(user, id, txId, dto.reason);
  }

  @Get(':id/transactions')
  @ApiOperation({
    summary:
      'List this account\'s bank transactions (date filters + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated bank transaction list' })
  async listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const from = parseOptionalCalendarDate('from', fromRaw);
    const to = parseOptionalCalendarDate('to', toRaw);
    const filter = { from, to };

    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.bankTransactionsService.list(user, id, {
        ...filter,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.bankTransactionsService.streamAll(user, id, filter);
    const filename = `bank-transactions-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, BANK_TRANSACTIONS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, BANK_TRANSACTIONS_EXPORT_COLUMNS, rows);
    }
  }

  @Get(':id/unreconciled')
  @ApiOperation({
    summary:
      'Payments/expenses linked to this account with no matching bank transaction yet — capped at 200 rows per side, with a truncated flag',
  })
  unreconciled(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bankTransactionsService.findUnreconciled(user, id);
  }
}
