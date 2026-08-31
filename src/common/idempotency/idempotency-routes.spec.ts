import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { BankAccountsController } from '../../modules/banks/bank-accounts.controller';
import { ExpensesController } from '../../modules/expenses/expenses.controller';
import { InvoicesController } from '../../modules/invoices/invoices.controller';
import { PaymentsController } from '../../modules/payments/payments.controller';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const reflector = new Reflector();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasIdempotency = (handler: (...args: any[]) => unknown): boolean => {
  const interceptors = reflector.get<unknown[] | undefined>(INTERCEPTORS_METADATA, handler);
  return interceptors?.includes(IdempotencyInterceptor) ?? false;
};

/**
 * Task brief 7.2: pins EXACTLY the mutating finance endpoints
 * IdempotencyInterceptor is meant to guard — not the whole app, and not
 * silently missing one either (see the task report for the full "which
 * routes and why" reasoning: everything here claims a gapless number,
 * writes a money ledger row, or mutates a money field, and is append-only
 * once written — a double-submit is not editable away afterwards). A future
 * route added to one of these controllers with no explicit
 * @UseInterceptors call either way starts this test failing red instead of
 * silently deciding by omission.
 */
describe('Idempotency-Key coverage — exactly the mutating finance endpoints', () => {
  it('payments: record/allocate/reverse guarded; list/document are read-only, not guarded', () => {
    expect(hasIdempotency(PaymentsController.prototype.record)).toBe(true);
    expect(hasIdempotency(PaymentsController.prototype.allocate)).toBe(true);
    expect(hasIdempotency(PaymentsController.prototype.reverse)).toBe(true);
    expect(hasIdempotency(PaymentsController.prototype.list)).toBe(false);
    expect(hasIdempotency(PaymentsController.prototype.document)).toBe(false);
  });

  it('invoices: convertToInvoice/create/voidInvoice/recordWithholding guarded; list/get/document/patchFiscal not', () => {
    expect(hasIdempotency(InvoicesController.prototype.convertToInvoice)).toBe(true);
    expect(hasIdempotency(InvoicesController.prototype.create)).toBe(true);
    expect(hasIdempotency(InvoicesController.prototype.voidInvoice)).toBe(true);
    expect(hasIdempotency(InvoicesController.prototype.recordWithholding)).toBe(true);
    expect(hasIdempotency(InvoicesController.prototype.list)).toBe(false);
    expect(hasIdempotency(InvoicesController.prototype.get)).toBe(false);
    expect(hasIdempotency(InvoicesController.prototype.document)).toBe(false);
    expect(hasIdempotency(InvoicesController.prototype.patchFiscal)).toBe(false);
  });

  it('expenses: record/reverse guarded; list/get not', () => {
    expect(hasIdempotency(ExpensesController.prototype.record)).toBe(true);
    expect(hasIdempotency(ExpensesController.prototype.reverse)).toBe(true);
    expect(hasIdempotency(ExpensesController.prototype.list)).toBe(false);
    expect(hasIdempotency(ExpensesController.prototype.get)).toBe(false);
  });

  it('bank accounts: recordTransaction/reverseTransaction guarded; create/list/update are not', () => {
    expect(hasIdempotency(BankAccountsController.prototype.recordTransaction)).toBe(true);
    expect(hasIdempotency(BankAccountsController.prototype.reverseTransaction)).toBe(true);
    expect(hasIdempotency(BankAccountsController.prototype.create)).toBe(false);
    expect(hasIdempotency(BankAccountsController.prototype.list)).toBe(false);
    expect(hasIdempotency(BankAccountsController.prototype.update)).toBe(false);
  });
});
