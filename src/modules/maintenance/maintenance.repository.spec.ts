import { MaintenanceRepository } from './maintenance.repository';

// Pulls the column name out of a drizzle asc()/desc() SQL wrapper — see the
// identical helper in customers.repository.spec.ts for the general
// queryChunks-walking technique this is a narrower version of.
const extractOrderByColumnNames = (arg: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if ('name' in x && typeof (x as { name?: unknown }).name === 'string' && 'table' in x) {
      out.push((x as { name: string }).name);
    }
    if ('queryChunks' in x) {
      for (const chunk of (x as { queryChunks: unknown[] }).queryChunks) walk(chunk);
    }
  };
  walk(arg);
  return out;
};

/** Wires a fake `select().from().leftJoin()...leftJoin().where().orderBy()
 * .limit().offset()` chain — streamAllContracts/streamAllBreakdowns now join
 * customers (and, for breakdowns, assets) for display names (REC 5). */
const makeStreamChain = () => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => Promise.resolve([]));
  return chain;
};

// logVisit derives lastServiceAt/nextServiceAt from "today", so the fix for
// the UTC-vs-Addis bug has to be proven at the point the date is stamped,
// not just in the date-math helper. Least mocking here is a fake tenant
// transaction whose select/insert/update chains return canned rows.

type Row = Record<string, unknown>;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const makeTx = (contractRow: Row, visitRow: Row, updatedRow: Row) => {
  const selectChain: Record<string, jest.Mock> = {};
  selectChain.from = jest.fn(() => selectChain);
  selectChain.where = jest.fn(() => selectChain);
  selectChain.limit = jest.fn(() => Promise.resolve([contractRow]));
  const select = jest.fn(() => selectChain);

  const insertChain: Record<string, jest.Mock> = {};
  insertChain.values = jest.fn(() => insertChain);
  insertChain.returning = jest.fn(() => Promise.resolve([visitRow]));
  const insert = jest.fn(() => insertChain);

  const updateChain: Record<string, jest.Mock> = {};
  updateChain.set = jest.fn(() => updateChain);
  updateChain.where = jest.fn(() => updateChain);
  updateChain.returning = jest.fn(() => Promise.resolve([updatedRow]));
  const update = jest.fn(() => updateChain);

  return { select, insert, update, updateChain };
};

const repoWithTx = (contractRow: Row, visitRow: Row, updatedRow: Row) => {
  const tx = makeTx(contractRow, visitRow, updatedRow);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
  );
  const repo = new MaintenanceRepository({ withTenant } as never);
  return { repo, ...tx };
};

describe('MaintenanceRepository.logVisit — Addis Ababa date derivation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stamps lastServiceAt with the Addis calendar date, not the UTC one', async () => {
    // 22:30 UTC on Aug 7 is 01:30 EAT on Aug 8 — already "tomorrow" in Addis.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T22:30:00Z'));

    const contractRow: Row = {
      id: CONTRACT_ID,
      status: 'ACTIVE',
      nextServiceAt: '2026-08-01',
      recurrence: 'MONTHLY',
    };
    const { repo, updateChain } = repoWithTx(
      contractRow,
      { id: 'visit-1' },
      { ...contractRow, lastServiceAt: '2026-08-08', nextServiceAt: '2026-09-01' },
    );

    await repo.logVisit(TENANT_ID, CONTRACT_ID, USER_ID, { notes: undefined });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastServiceAt: '2026-08-08',
        nextServiceAt: '2026-09-01',
      }),
    );
  });
});

describe('MaintenanceRepository.streamAllContracts — orderBy tiebreaker', () => {
  it('breaks ties on id, so rows sharing a nextServiceAt cannot be duplicated/skipped across batches', async () => {
    const chain = makeStreamChain();
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new MaintenanceRepository({ withTenant } as never);

    const gen = repo.streamAllContracts(TENANT_ID, {});
    await gen.next();

    const orderByArgs = chain.orderBy!.mock.calls[0] as unknown[];
    expect(orderByArgs).toHaveLength(2);
    expect(extractOrderByColumnNames(orderByArgs[1])).toContain('id');
  });

  it('joins assets and customers (tenant-scoped), selecting assetName/customerName instead of the raw FKs', async () => {
    const joinConditions: unknown[] = [];
    const chain = makeStreamChain();
    chain.leftJoin = jest.fn((_table: unknown, on: unknown) => {
      joinConditions.push(on);
      return chain;
    });
    let selectedShape: Record<string, unknown> | undefined;
    const select = jest.fn((shape: Record<string, unknown>) => {
      selectedShape = shape;
      return chain;
    });
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new MaintenanceRepository({ withTenant } as never);

    const gen = repo.streamAllContracts(TENANT_ID, {});
    await gen.next();

    expect(selectedShape).toHaveProperty('assetName');
    expect(selectedShape).toHaveProperty('customerName');
    expect(selectedShape).not.toHaveProperty('assetId');
    expect(selectedShape).not.toHaveProperty('customerId');

    // Both leftJoins' `on` conditions must compare tenantId on both sides
    // (not just the FK-to-id equality) — that's the defense-in-depth that
    // stops a cross-tenant row from ever being joinable, even if RLS were
    // somehow bypassed. `tenant_id` (the DB column name) should appear
    // twice per join condition: once from each side of the `eq()`.
    expect(joinConditions).toHaveLength(2);
    for (const on of joinConditions) {
      const columnNames = extractOrderByColumnNames(on);
      expect(columnNames.filter((n) => n === 'tenant_id')).toHaveLength(2);
    }
  });
});

describe('MaintenanceRepository.streamAllBreakdowns — orderBy tiebreaker', () => {
  it('breaks ties on id, so rows sharing a createdAt cannot be duplicated/skipped across batches', async () => {
    const chain = makeStreamChain();
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new MaintenanceRepository({ withTenant } as never);

    const gen = repo.streamAllBreakdowns(TENANT_ID, {});
    await gen.next();

    const orderByArgs = chain.orderBy!.mock.calls[0] as unknown[];
    expect(orderByArgs).toHaveLength(2);
    expect(extractOrderByColumnNames(orderByArgs[1])).toContain('id');
  });

  it('joins assets and customers (tenant-scoped), selecting assetName/customerName instead of the raw FKs', async () => {
    const joinConditions: unknown[] = [];
    const chain = makeStreamChain();
    chain.leftJoin = jest.fn((_table: unknown, on: unknown) => {
      joinConditions.push(on);
      return chain;
    });
    let selectedShape: Record<string, unknown> | undefined;
    const select = jest.fn((shape: Record<string, unknown>) => {
      selectedShape = shape;
      return chain;
    });
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new MaintenanceRepository({ withTenant } as never);

    const gen = repo.streamAllBreakdowns(TENANT_ID, {});
    await gen.next();

    expect(selectedShape).toHaveProperty('assetName');
    expect(selectedShape).toHaveProperty('customerName');
    expect(selectedShape).not.toHaveProperty('assetId');
    expect(selectedShape).not.toHaveProperty('customerId');

    // Same tenant-scoping check as the contracts test above.
    expect(joinConditions).toHaveLength(2);
    for (const on of joinConditions) {
      const columnNames = extractOrderByColumnNames(on);
      expect(columnNames.filter((n) => n === 'tenant_id')).toHaveLength(2);
    }
  });
});
