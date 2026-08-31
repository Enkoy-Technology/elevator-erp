import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import { ExpensesRepository, type RecordExpenseInput } from './expenses.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const RATE_VERSION_ID = '77777777-7777-7777-7777-777777777777';
const EXPENSE_ID = '88888888-8888-8888-8888-888888888888';

/** A fake select chain that is also "thenable" at any step — see invoices.repository.spec.ts's own copy for why. */
interface SelectChain {
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => void;
}

const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
  return chain;
};

/** Wires a fake `insert().values().onConflictDoUpdate().returning()` chain (document_sequences claim). */
const makeSeqInsertChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoUpdate = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `insert().values().returning()` chain, capturing the inserted values. */
const makeInsertChain = (returning: unknown[], onValues?: (v: unknown) => void) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: unknown) => {
    onValues?.(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

const makeExecute = () => jest.fn(() => Promise.resolve(undefined));

const fy = computeFiscalYear(todayIso(), '07-08');
const fyLabelSafe = fy.label.replace('/', '-');

const baseInput: RecordExpenseInput = {
  supplierName: 'Acme Supplies',
  supplierTin: '000111222',
  supplierLicenceOnFile: true,
  supplyKind: 'GOODS',
  category: 'MATERIALS',
  expenseDate: '2020-06-15',
  paidVia: 'CASH',
  bankAccountId: null,
  netAmountEtb: '20000.00',
  vatEtb: '3000.00',
  amountEtb: '23000.00',
  whtRatePercent: '3.00',
  whtEtb: '600.00',
  rateVersionId: RATE_VERSION_ID,
  description: null,
  reference: 'INV-4821',
};

describe('ExpensesRepository.record — one-transaction claim + insert (brief 4.1)', () => {
  it('claims a gapless EXP number and inserts every computed money/WHT column verbatim', async () => {
    const select = jest
      .fn()
      // fiscalYearForToday: tenant fiscalYearStart
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));

    let inserted: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: EXPENSE_ID, tenantId: TENANT_ID, ...baseInput, status: 'RECORDED' }],
          (v) => (inserted = v as Record<string, unknown>),
        ),
      );
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    const result = await repo.record(TENANT_ID, USER_ID, baseInput);

    expect(inserted).toMatchObject({
      tenantId: TENANT_ID,
      expenseNumber: `EXP-${fyLabelSafe}-0001`,
      fiscalYearLabel: fy.label,
      recordedByUserId: USER_ID,
      ...baseInput,
    });
    // netPayableEtb (gross - wht) is computed on read, never stored.
    expect(result.netPayableEtb).toBe('22400.00');
    expect((inserted as { netPayableEtb?: unknown }).netPayableEtb).toBeUndefined();
  });

  it('reclassifies a foreign-key violation (bankAccountId that does not resolve in this tenant) as NotFoundException (404) instead of an unhandled 500', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        const cause: Error & { code?: string } = new Error(
          'insert or update on table "expenses" violates foreign key constraint "expenses_bank_account_id_fkey"',
        );
        cause.code = '23503';
        const err: Error & { cause?: unknown } = new Error('Failed query: insert into "expenses" ...');
        err.cause = cause;
        return Promise.reject(err);
      }),
    };
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(failingInsertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    await expect(
      repo.record(TENANT_ID, USER_ID, { ...baseInput, bankAccountId: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExpensesRepository.reverse — insert-only mirror + double-reversal 409 (brief 4.2)', () => {
  const originalRow = {
    id: EXPENSE_ID,
    category: 'MATERIALS',
    supplyKind: 'GOODS',
    supplierName: 'Acme Supplies',
    supplierTin: '000111222',
    supplierLicenceOnFile: true,
    netAmountEtb: '20000.00',
    vatEtb: '3000.00',
    amountEtb: '23000.00',
    whtRatePercent: '3.00',
    whtEtb: '600.00',
    rateVersionId: RATE_VERSION_ID,
    paidVia: 'CASH',
    bankAccountId: null,
    description: null,
    reference: 'INV-4821',
    reversalOfExpenseId: null,
  };

  it('inserts a mirroring row with every money column negated, never touching the original', async () => {
    const select = jest
      .fn()
      // 1. fiscalYearForToday — claimed BEFORE the advisory lock (lock-order
      // consistency fix: see reverse()'s own doc comment)
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // 2. load original
      .mockReturnValueOnce(makeSelectChain([originalRow]))
      // 3. existing-reversal check: none found
      .mockReturnValueOnce(makeSelectChain([]));

    let insertedReversal: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [
            {
              ...originalRow,
              id: 'reversal-id',
              netAmountEtb: '-20000.00',
              vatEtb: '-3000.00',
              amountEtb: '-23000.00',
              whtEtb: '-600.00',
              status: 'REVERSED',
              reversalOfExpenseId: EXPENSE_ID,
              reverseReason: 'Duplicate entry',
            },
          ],
          (v) => (insertedReversal = v as Record<string, unknown>),
        ),
      );
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    const result = await repo.reverse(TENANT_ID, EXPENSE_ID, USER_ID, 'Duplicate entry');

    // Only ONE insert of the reversal expense row happened (plus the
    // sequence claim insert) — no update() call was ever wired into the
    // fake tx, so the original could not have been touched even if the
    // implementation tried.
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insertedReversal).toMatchObject({
      tenantId: TENANT_ID,
      netAmountEtb: '-20000.00',
      vatEtb: '-3000.00',
      amountEtb: '-23000.00',
      whtRatePercent: '3.00', // a rate, not money — copied, not negated
      whtEtb: '-600.00',
      rateVersionId: RATE_VERSION_ID,
      status: 'REVERSED',
      reversalOfExpenseId: EXPENSE_ID,
      reverseReason: 'Duplicate entry',
      supplierName: 'Acme Supplies',
      supplyKind: 'GOODS',
    });
    expect(result.amountEtb).toBe('-23000.00');
    // netPayableEtb on a reversal is itself negative — money handed back.
    expect(result.netPayableEtb).toBe('-22400.00');
  });

  it('B1a: rejects reversing a reversal (409) — a reversal expense can never itself be reversed', async () => {
    const alreadyAReversal = { ...originalRow, id: 'reversal-1', reversalOfExpenseId: EXPENSE_ID };
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([alreadyAReversal]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]));
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    await expect(repo.reverse(TENANT_ID, 'reversal-1', USER_ID, 'oops')).rejects.toThrow(
      WorkflowTransitionError,
    );
    // Only the sequence claim — never a second-order reversal insert.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('double reversal: a second reverse() on an already-reversed expense 409s', async () => {
    const select = jest
      .fn()
      // fiscalYearForToday — the number is still claimed even though the
      // guards below end up rejecting the request (mirrors
      // PaymentsRepository.reverse's own "a wasted claim rolls back with
      // the rest of the transaction" behaviour).
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalRow]))
      // existing-reversal check finds one this time
      .mockReturnValueOnce(makeSelectChain([{ id: 'already-reversed-id' }]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]));
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    await expect(repo.reverse(TENANT_ID, EXPENSE_ID, USER_ID, 'second try')).rejects.toThrow(
      WorkflowTransitionError,
    );
    // Only the sequence claim — never a second insert for the reversal row.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('reversing a non-existent expense 404s', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]));
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    await expect(repo.reverse(TENANT_ID, EXPENSE_ID, USER_ID, 'oops')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('consistency fix: claims the reversal number BEFORE taking the advisory lock — same order as PaymentsRepository.record/reverse', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalRow]))
      .mockReturnValueOnce(makeSelectChain([]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]))
      .mockReturnValueOnce(makeInsertChain([{ ...originalRow, id: 'reversal-id' }]));
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new ExpensesRepository({ withTenant } as never);

    await repo.reverse(TENANT_ID, EXPENSE_ID, USER_ID, 'Duplicate entry');

    const claimOrder = insert.mock.invocationCallOrder[0]!;
    const lockOrder = execute.mock.invocationCallOrder[0]!;
    expect(claimOrder).toBeLessThan(lockOrder);
  });
});
