import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ratePayloadSchemaFor } from '../rates/rate-payloads';
import { RatesService } from '../rates/rates.service';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import { splitVatExclusive, splitVatInclusive } from './expense-money';
import {
  ExpensesRepository,
  type ExpenseListFilter,
  type ExpenseWithNetPayable,
} from './expenses.repository';
import { computeWithholding, selectWhtKind } from './wht-decision';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly expensesRepository: ExpensesRepository,
    private readonly ratesService: RatesService,
  ) {}

  list(
    user: AuthenticatedUser,
    options: ExpenseListFilter & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<ExpenseWithNetPayable>> {
    return this.expensesRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: ExpenseListFilter,
  ): AsyncGenerator<ExpenseWithNetPayable> {
    return this.expensesRepository.streamAll(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<ExpenseWithNetPayable> {
    const row = await this.expensesRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Expense not found');
    }
    return row;
  }

  /**
   * Records an expense — VAT/WHT math (brief 4.1 steps 1-5) happens here,
   * off rate payloads resolved AT THE EXPENSE DATE, not today. This
   * deliberately differs from InvoicesService.createStandalone, which
   * resolves VAT at today's date: an invoice is priced when it is ISSUED,
   * an expense is priced when the underlying bill was incurred — a bill
   * recorded late must not silently pick up a rate that postdates it. The
   * repository only owns the transaction-bound protocol (numbering claim +
   * insert), same division of labour as InvoicesService/InvoicesRepository.
   */
  async record(
    user: AuthenticatedUser,
    dto: CreateExpenseDto,
  ): Promise<ExpenseWithNetPayable> {
    // Step 1: VAT resolved at the expense date.
    const vatVersion = await this.ratesService.resolve('VAT', dto.expenseDate);
    const vatPayload = ratePayloadSchemaFor('VAT').parse(vatVersion.payload) as {
      percent: string;
    };

    // Step 2: net/vat/gross split, whichever direction the bill was recorded
    // (CreateExpenseDto's cross-field validators guarantee exactly one of
    // netAmountEtb/grossAmountEtb is present, matching vatIncluded).
    const split = dto.vatIncluded
      ? splitVatInclusive(dto.grossAmountEtb!, vatPayload.percent)
      : splitVatExclusive(dto.netAmountEtb!, vatPayload.percent);

    // Step 3: which WHT rate kind applies — no rate lookup yet.
    const whtKind = selectWhtKind({
      supplierTin: dto.supplierTin,
      supplierLicenceOnFile: dto.supplierLicenceOnFile,
      supplyKind: dto.supplyKind,
    });

    // Step 4: resolve THAT rate version, also at the expense date, and
    // parse its payload — percentPayload for WHT_NO_TIN (no threshold),
    // withholdingPayload (adds thresholdEtb) for WHT_GOODS/WHT_SERVICES.
    const whtVersion = await this.ratesService.resolve(whtKind, dto.expenseDate);
    const whtPayload = ratePayloadSchemaFor(whtKind).parse(whtVersion.payload) as {
      percent: string;
      thresholdEtb?: string;
    };

    // Step 5: rate + amount. rateVersionId is stored regardless of whether
    // the computed withholding is zero — see wht-decision.ts's doc comment
    // and expenses.ts's schema comment on rateVersionId.
    const wht = computeWithholding(whtKind, split.netEtb, whtPayload);

    return this.expensesRepository.record(user.tenantId, user.userId, {
      supplierName: dto.supplierName,
      supplierTin: dto.supplierTin ?? null,
      supplierLicenceOnFile: dto.supplierLicenceOnFile,
      supplyKind: dto.supplyKind,
      category: dto.category,
      expenseDate: dto.expenseDate,
      paidVia: dto.paidVia,
      bankAccountId: dto.bankAccountId ?? null,
      netAmountEtb: split.netEtb,
      vatEtb: split.vatEtb,
      amountEtb: split.grossEtb,
      whtRatePercent: wht.ratePercent,
      whtEtb: wht.whtEtb,
      rateVersionId: whtVersion.id,
      description: dto.description ?? null,
      reference: dto.reference ?? null,
    });
  }

  reverse(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<ExpenseWithNetPayable> {
    return this.expensesRepository.reverse(user.tenantId, id, user.userId, reason);
  }
}
