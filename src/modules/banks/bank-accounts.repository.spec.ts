import { NotFoundException } from '@nestjs/common';

import { BankAccountsRepository } from './bank-accounts.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const ACCOUNT_ID = '77777777-7777-7777-7777-777777777777';

/** A fake select chain that is also "thenable" at any step — see invoices.repository.spec.ts's own copy for why. */
interface SelectChain {
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  groupBy: jest.Mock;
  then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => void;
}

const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
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

/** Wires a fake `update().set().where().returning()` chain, capturing the set() values. */
const makeUpdateChain = (returning: unknown[], onSet?: (v: Record<string, unknown>) => void) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn((v: Record<string, unknown>) => {
    onSet?.(v);
    return chain;
  });
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

describe('BankAccountsRepository.create — no balance query for a brand-new account', () => {
  it('inserts and returns balanceEtb 0.00 without ever querying bank_transactions', async () => {
    const insert = jest.fn().mockReturnValueOnce(
      makeInsertChain([
        {
          id: ACCOUNT_ID,
          tenantId: TENANT_ID,
          name: 'Operating',
          bankName: 'CBE',
          accountNumber: '1000',
          isActive: true,
        },
      ]),
    );
    const select = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    const result = await repo.create(TENANT_ID, {
      name: 'Operating',
      bankName: 'CBE',
      accountNumber: '1000',
    });

    expect(result.balanceEtb).toBe('0.00');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('BankAccountsRepository.update', () => {
  it('patches only the provided columns and returns the recomputed balance', async () => {
    let setValues: Record<string, unknown> = {};
    const update = jest.fn().mockReturnValueOnce(
      makeUpdateChain(
        [
          {
            id: ACCOUNT_ID,
            tenantId: TENANT_ID,
            name: 'Operating',
            bankName: 'CBE',
            accountNumber: '1000',
            isActive: false,
          },
        ],
        (v) => (setValues = v),
      ),
    );
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ balance: '150.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    const result = await repo.update(TENANT_ID, ACCOUNT_ID, { isActive: false });

    expect(setValues).toMatchObject({ isActive: false });
    expect(setValues.name).toBeUndefined();
    expect(result.balanceEtb).toBe('150.00');
  });

  it('deactivating an account with a non-zero balance is allowed — no warning field', async () => {
    const update = jest.fn().mockReturnValueOnce(
      makeUpdateChain([
        { id: ACCOUNT_ID, tenantId: TENANT_ID, name: 'x', bankName: 'x', accountNumber: '1', isActive: false },
      ]),
    );
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ balance: '-500.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    const result = await repo.update(TENANT_ID, ACCOUNT_ID, { isActive: false });

    expect(result.isActive).toBe(false);
    expect(result.balanceEtb).toBe('-500.00');
    expect(Object.keys(result)).not.toContain('warning');
  });

  it('404s when the account does not exist', async () => {
    const update = jest.fn().mockReturnValueOnce(makeUpdateChain([]));
    const select = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, update }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    await expect(repo.update(TENANT_ID, ACCOUNT_ID, { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BankAccountsRepository.list — balance aggregation must be ONE query for the whole page (brief 4.4, no N+1)', () => {
  it('sums signed amounts per account with a single grouped query, however many accounts are on the page', async () => {
    // 4 accounts on this page — if the balance lookup were per-account
    // (the N+1 this test exists to catch), select() would be called
    // 2 + 4 = 6 times instead of 3.
    const accountRows = ['a', 'b', 'c', 'd'].map((letter, i) => ({
      id: `${letter}${letter}${letter}${letter}${letter}${letter}${letter}${letter}-0000-0000-0000-00000000000${i}`,
      tenantId: TENANT_ID,
      name: `Account ${letter}`,
      bankName: 'CBE',
      accountNumber: `100${i}`,
      isActive: true,
    }));
    const [a, b, c] = accountRows;

    const select = jest
      .fn()
      // 1. total count
      .mockReturnValueOnce(makeSelectChain([{ value: 4 }]))
      // 2. paged accounts
      .mockReturnValueOnce(makeSelectChain(accountRows))
      // 3. THE ONE aggregate balance query for the whole page — mixed
      // signed amounts (deposits and withdrawals) prove Σ is a real signed
      // sum, not a magnitude sum. Account d has no bank_transactions rows
      // at all (no row in this result), so it must default to 0.00 rather
      // than being dropped or throwing.
      .mockReturnValueOnce(
        makeSelectChain([
          { bankAccountId: a!.id, balance: '1300.00' }, // 1500.00 deposit - 200.00 withdrawal
          { bankAccountId: b!.id, balance: '-45.50' },
          { bankAccountId: c!.id, balance: '0.00' },
        ]),
      );

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    const result = await repo.list(TENANT_ID, {});

    // Exactly 3 select() calls total: count, page, ONE balance aggregate —
    // never one aggregate call per account.
    expect(select).toHaveBeenCalledTimes(3);
    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.balanceEtb)).toEqual([
      '1300.00',
      '-45.50',
      '0.00',
      '0.00', // d: no bank_transactions rows at all -> defaults to 0.00
    ]);
  });

  it('skips the balance query entirely when the page has zero accounts', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ value: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new BankAccountsRepository({ withTenant } as never);

    const result = await repo.list(TENANT_ID, {});

    expect(select).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([]);
  });
});
