import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { BankTransactionsRepository } from './bank-transactions.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '77777777-7777-7777-7777-777777777777';
const PAYMENT_ID = '88888888-8888-8888-8888-888888888888';

/** A fake select chain that is also "thenable" at any step — see invoices.repository.spec.ts's own copy for why. */
interface SelectChain {
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => void;
}

const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
  return chain;
};

const baseInput = {
  bankAccountId: ACCOUNT_ID,
  txDate: '2026-08-08',
  amountEtb: '-1500.00',
  kind: 'WITHDRAWAL' as const,
  description: 'Fuel purchase',
  paymentId: null,
  expenseId: null,
};

describe('BankTransactionsRepository.record — link existence + uniqueness (brief 4.5)', () => {
  it('inserts a signed line with no link, no payment/expense lookup performed', async () => {
    const select = jest
      .fn()
      // account existence check only — no paymentId/expenseId given
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }]));
    const insertedChain: Record<string, jest.Mock> = {
      values: jest.fn(() => insertedChain),
      returning: jest.fn(() =>
        Promise.resolve([{ id: 'tx-1', tenantId: TENANT_ID, ...baseInput }]),
      ),
    };
    const insert = jest.fn().mockReturnValueOnce(insertedChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    const result = await repo.record(TENANT_ID, USER_ID, baseInput);

    expect(select).toHaveBeenCalledTimes(1);
    expect(result.amountEtb).toBe('-1500.00');
  });

  it('404s when the bank account does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const insert = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(repo.record(TENANT_ID, USER_ID, baseInput)).rejects.toThrow(NotFoundException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('404s when the linked payment does not exist in this tenant', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }])) // account exists
      .mockReturnValueOnce(makeSelectChain([])); // payment lookup: none
    const insert = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(
      repo.record(TENANT_ID, USER_ID, { ...baseInput, paymentId: PAYMENT_ID }),
    ).rejects.toThrow(NotFoundException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects linking a payment that is recorded against a DIFFERENT bank account — insert-only means a wrong link can never be corrected', async () => {
    const OTHER_ACCOUNT_ID = '99999999-9999-9999-9999-999999999999';
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }])) // account exists
      .mockReturnValueOnce(
        makeSelectChain([{ id: PAYMENT_ID, bankAccountId: OTHER_ACCOUNT_ID }]),
      ); // payment exists but belongs to a different account
    const insert = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(
      repo.record(TENANT_ID, USER_ID, { ...baseInput, paymentId: PAYMENT_ID }),
    ).rejects.toThrow(BadRequestException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('allows linking a payment whose own bankAccountId is null (e.g. a CASH receipt later deposited)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }])) // account exists
      .mockReturnValueOnce(makeSelectChain([{ id: PAYMENT_ID, bankAccountId: null }])); // payment exists, no account of its own
    const insertedChain: Record<string, jest.Mock> = {
      values: jest.fn(() => insertedChain),
      returning: jest.fn(() =>
        Promise.resolve([{ id: 'tx-1', tenantId: TENANT_ID, ...baseInput, paymentId: PAYMENT_ID }]),
      ),
    };
    const insert = jest.fn().mockReturnValueOnce(insertedChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    const result = await repo.record(TENANT_ID, USER_ID, { ...baseInput, paymentId: PAYMENT_ID });

    expect(result.paymentId).toBe(PAYMENT_ID);
  });

  it('reclassifies the unique-partial-index violation on a second link to the same payment as 409 — real driver shape: code lives on err.cause, not err itself', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }])) // account exists
      .mockReturnValueOnce(
        makeSelectChain([{ id: PAYMENT_ID, bankAccountId: ACCOUNT_ID }]),
      ); // payment exists, same account
    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        // Matches drizzle-orm's real DrizzleQueryError shape: the pg
        // driver's raw error (carrying `.code`) is wrapped as `.cause`, not
        // set directly on the thrown error — see
        // invoices.repository.spec.ts's own copy of this exact shape.
        const cause: Error & { code?: string } = new Error(
          'duplicate key value violates unique constraint "bank_transactions_payment_uk"',
        );
        cause.code = '23505';
        const err: Error & { cause?: unknown } = new Error(
          'Failed query: insert into "bank_transactions" ...',
        );
        err.cause = cause;
        return Promise.reject(err);
      }),
    };
    const insert = jest.fn().mockReturnValueOnce(failingInsertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(
      repo.record(TENANT_ID, USER_ID, { ...baseInput, paymentId: PAYMENT_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('an unrelated insert failure (not a unique violation) still propagates as-is, not swallowed into a 409', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }]));
    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => Promise.reject(new Error('connection reset'))),
    };
    const insert = jest.fn().mockReturnValueOnce(failingInsertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(repo.record(TENANT_ID, USER_ID, baseInput)).rejects.toThrow('connection reset');
  });
});

describe('BankTransactionsRepository — insert-only (brief 4.5: no edit/delete endpoint at all)', () => {
  it('exposes no update or delete method whatsoever', () => {
    const proto = BankTransactionsRepository.prototype as unknown as Record<string, unknown>;
    expect(proto.update).toBeUndefined();
    expect(proto.delete).toBeUndefined();
    expect(proto.remove).toBeUndefined();
  });
});

describe('BankTransactionsRepository.findUnreconciled — 200-row cap per side, never silent (brief 4.6)', () => {
  const makeRow = (i: number) => ({ id: `row-${i}` });

  /**
   * findUnreconciled builds each side's WHERE as
   * `and(eq(...), notExists(tx.select()...))` — JS evaluates the OUTER
   * `tx.select().from(...)` first (that's the real, awaited query), then
   * evaluates the `.where(...)` ARGUMENT before calling `.where()`, which is
   * where the INNER notExists() subquery's own `tx.select()` runs (built,
   * never awaited — notExists() just stores it as a lazy SQL chunk, see
   * conditions.js). So the shared `select` mock sees, in order: account
   * check, payments-outer (real), payments-inner-subquery (dummy, never
   * consumed), expenses-outer (real), expenses-inner-subquery (dummy).
   */
  const mockFindUnreconciledSelects = (paymentRows: unknown[], expenseRows: unknown[]) =>
    jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: ACCOUNT_ID }])) // account exists
      .mockReturnValueOnce(makeSelectChain(paymentRows)) // payments outer (awaited)
      .mockReturnValueOnce(makeSelectChain([])) // payments notExists subquery (never awaited)
      .mockReturnValueOnce(makeSelectChain(expenseRows)) // expenses outer (awaited)
      .mockReturnValueOnce(makeSelectChain([])); // expenses notExists subquery (never awaited)

  it('truncated stays false at exactly the 200-row boundary', async () => {
    const select = mockFindUnreconciledSelects(
      Array.from({ length: 200 }, (_, i) => makeRow(i)),
      Array.from({ length: 5 }, (_, i) => makeRow(i)),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    const result = await repo.findUnreconciled(TENANT_ID, ACCOUNT_ID);

    expect(result.payments.items).toHaveLength(200);
    expect(result.payments.truncated).toBe(false);
    expect(result.expenses.items).toHaveLength(5);
    expect(result.expenses.truncated).toBe(false);
  });

  it('truncated flips true the instant a 201st row exists, and the 201st row is never returned', async () => {
    const select = mockFindUnreconciledSelects(
      Array.from({ length: 201 }, (_, i) => makeRow(i)), // cap+1
      [],
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    const result = await repo.findUnreconciled(TENANT_ID, ACCOUNT_ID);

    expect(result.payments.items).toHaveLength(200);
    expect(result.payments.items.map((row) => row.id)).not.toContain('row-200');
    expect(result.payments.truncated).toBe(true);
    expect(result.expenses.items).toHaveLength(0);
    expect(result.expenses.truncated).toBe(false);
  });

  it('404s when the bank account does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new BankTransactionsRepository({ withTenant } as never);

    await expect(repo.findUnreconciled(TENANT_ID, ACCOUNT_ID)).rejects.toThrow(NotFoundException);
  });
});
