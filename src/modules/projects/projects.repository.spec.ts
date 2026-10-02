import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import {
  deliveryCountdown,
  ProjectsRepository,
  type SignedDelivery,
} from './projects.repository';

// Pulls every literal string embedded in a drizzle SQL fragment's
// queryChunks — mirrors the identical helper in customers.repository.spec.ts.
const extractSqlLiterals = (fragment: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') {
      out.push(x);
      return;
    }
    if (x && typeof x === 'object' && 'queryChunks' in x) {
      for (const chunk of (x as { queryChunks: unknown[] }).queryChunks) {
        walk(chunk);
      }
    }
  };
  walk(fragment);
  return out;
};

// Pulls the column name out of a drizzle asc()/desc() SQL wrapper — same
// queryChunks shape as above, used to assert the PK tiebreaker is actually
// present in orderBy() without needing a real column/table object.
const extractOrderByColumnNames = (arg: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if (
      'name' in x &&
      typeof (x as { name?: unknown }).name === 'string' &&
      'table' in x
    ) {
      out.push((x as { name: string }).name);
    }
    if ('queryChunks' in x) {
      for (const chunk of (x as { queryChunks: unknown[] }).queryChunks)
        walk(chunk);
    }
  };
  walk(arg);
  return out;
};

/** Wires a fake `select().from().leftJoin().where().orderBy().limit().offset()`
 * chain — streamAll() now joins customers for the display name (REC 5), so
 * the chain must tolerate a leftJoin() call, unlike list()'s plainer chain. */
const makeStreamChain = (onWhere: (w: unknown) => void) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn((w: unknown) => {
    onWhere(w);
    return chain;
  });
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => Promise.resolve([]));
  return chain;
};

// Mirrors the Ethiopic-normalization coverage in
// customers.repository.spec.ts. Projects have no name-search or name-update
// endpoint today (see task-5-brief.md and task-5-report.md), so create() is
// the only write path that needs to populate nameNormalized.

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

describe('ProjectsRepository.create — Ethiopic-normalized write', () => {
  it('stores normalizeEthiopic(name) in nameNormalized alongside the original name', async () => {
    let captured: Record<string, unknown> = {};
    const insertChain: Record<string, jest.Mock> = {};
    insertChain.values = jest.fn((v: Record<string, unknown>) => {
      captured = v;
      return insertChain;
    });
    insertChain.returning = jest.fn(() => Promise.resolve([{ id: 'p1' }]));
    const insert = jest.fn(() => insertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ insert }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    await repo.create(TENANT_ID, 'creator-id', {
      customerId: 'c1',
      name: 'ሠራተኛ Elevator Install',
    });

    expect(captured.name).toBe('ሠራተኛ Elevator Install');
    expect(captured.nameNormalized).toBe(
      normalizeEthiopic('ሠራተኛ Elevator Install'),
    );
    expect(captured.nameNormalized).toBe('ሰራተኛ elevator install');
  });
});

describe('ProjectsRepository.streamAll — orderBy tiebreaker', () => {
  it('breaks ties on id, so rows sharing a createdAt cannot be duplicated/skipped across batches', async () => {
    const chain = makeStreamChain(() => {});
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, {});
    await gen.next();

    const orderByArgs = chain.orderBy!.mock.calls[0] as unknown[];
    expect(orderByArgs).toHaveLength(2);
    expect(extractOrderByColumnNames(orderByArgs[1])).toContain('id');
  });
});

describe('ProjectsRepository.streamAll — customer display name (REC 5)', () => {
  it('joins customers (tenant-scoped) and selects customerName instead of the raw customerId', async () => {
    let joinedWith: unknown;
    let selectedShape: Record<string, unknown> | undefined;
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn(() => chain);
    chain.leftJoin = jest.fn((_table: unknown, on: unknown) => {
      joinedWith = on;
      return chain;
    });
    chain.where = jest.fn(() => chain);
    chain.orderBy = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn((shape: Record<string, unknown>) => {
      selectedShape = shape;
      return chain;
    });
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, {});
    await gen.next();

    expect(joinedWith).toBeDefined();
    expect(selectedShape).toHaveProperty('customerName');
    expect(selectedShape).not.toHaveProperty('customerId');

    // The join's `on` condition must compare tenantId on both sides (not
    // just the FK-to-id equality) — defense in depth so a cross-tenant
    // customer row can never be joined even if RLS were somehow bypassed.
    const columnNames = extractOrderByColumnNames(joinedWith);
    expect(columnNames.filter((n) => n === 'tenant_id')).toHaveLength(2);
  });
});

// Mirrors CustomersRepository's Ethiopic-normalized search coverage (REC 6):
// projects.nameNormalized has existed since the 0029-era migration but
// list()/streamAll() never read it until now.
describe('ProjectsRepository — Ethiopic-normalized name search (q)', () => {
  it('list() searches nameNormalized with the query run through normalizeEthiopic, not the raw query', async () => {
    let where: unknown;
    const countChain: Record<string, jest.Mock> = {};
    countChain.from = jest.fn(() => countChain);
    countChain.where = jest.fn(() => Promise.resolve([{ value: 0 }]));
    const itemsChain: Record<string, jest.Mock> = {};
    itemsChain.from = jest.fn(() => itemsChain);
    itemsChain.where = jest.fn((w: unknown) => {
      where = w;
      return itemsChain;
    });
    itemsChain.orderBy = jest.fn(() => itemsChain);
    itemsChain.limit = jest.fn(() => itemsChain);
    itemsChain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn();
    select.mockReturnValueOnce(countChain).mockReturnValueOnce(itemsChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    // ኃይሉ (XAA order) should match a project stored as ሃይሉ (HAA order) — the
    // homophone-fold this feature exists for.
    await repo.list(TENANT_ID, { q: 'ኃይሉ' });

    const literals = extractSqlLiterals(where);
    expect(literals).toContain(`%${normalizeEthiopic('ኃይሉ')}%`);
    expect(literals).toContain('%ሃይሉ%');
  });

  it('streamAll() applies the same normalized search leg as list()', async () => {
    let where: unknown;
    const chain = makeStreamChain((w) => (where = w));
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, { q: 'ኃይሉ' });
    await gen.next();

    const literals = extractSqlLiterals(where);
    expect(literals).toContain('%ሃይሉ%');
  });
});

// DAG gate (finance-exports-sms task 2, restoring b00ccf4's spirit against
// the current module boundary): QUOTATION -> PROFORMA requires an issued,
// non-cancelled proforma. The check queries the proformas table directly
// from projects.repository — a repository-level EXISTS query against a
// shared /database/schema table, not a cross-module import (projects does
// NOT import the quotations or proformas module).
describe('ProjectsRepository.updateStatus', () => {
  const PROJECT_ID = '44444444-4444-4444-4444-444444444444';

  it('is a plain compare-and-swap: no subquery on any transition', async () => {
    const updateChain: Record<string, jest.Mock> = {};
    updateChain.set = jest.fn(() => updateChain);
    updateChain.where = jest.fn(() => updateChain);
    updateChain.returning = jest.fn(() =>
      Promise.resolve([{ id: PROJECT_ID, status: 'QUOTATION' }]),
    );
    const update = jest.fn(() => updateChain);
    const select = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new ProjectsRepository({ withTenant } as never);

    await repo.updateStatus(TENANT_ID, PROJECT_ID, 'LEAD', 'QUOTATION');

    expect(select).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('deliveryCountdown', () => {
  const signed = (
    overrides: Partial<SignedDelivery> = {},
  ): SignedDelivery => ({
    signedAt: '2026-09-24',
    deliveryDays: 90,
    contractValueEtb: '7000000.00',
    penaltyPercentPerDay: null,
    penaltyCapPercent: null,
    ...overrides,
  });

  it('counts working days down from the signing date: 90 signed Thu 24 Sep leaves 84 on Fri 2 Oct', () => {
    expect(deliveryCountdown([signed()], '2026-10-02')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: 84,
      deliveryPenaltyEtb: null,
    });
  });

  it('charges no penalty on the due date itself', () => {
    expect(deliveryCountdown([signed()], '2027-01-28')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: 0,
      deliveryPenaltyEtb: null,
    });
  });

  it('once overdue, charges 0.002% of the contract total for every calendar day', () => {
    // Due Thu 28 Jan; Thu 4 Feb is 5 working days and 7 calendar days late.
    // 7,000,000 x 0.002% = 140.00 a day.
    expect(deliveryCountdown([signed()], '2027-02-04')).toEqual({
      deliveryDueDate: '2027-01-28',
      deliveryDaysLeft: -5,
      deliveryPenaltyEtb: '980.00',
    });
  });

  it("uses the contract's own rate and stops at its cap", () => {
    // 0.5% a day is 35,000; 30 days would be 1,050,000 but 5% caps it at 350,000.
    expect(
      deliveryCountdown(
        [signed({ penaltyPercentPerDay: '0.500', penaltyCapPercent: '5.00' })],
        '2027-02-27',
      ).deliveryPenaltyEtb,
    ).toBe('350000.00');
    expect(
      deliveryCountdown(
        [signed({ penaltyPercentPerDay: '0.500', penaltyCapPercent: '5.00' })],
        '2027-01-30',
      ).deliveryPenaltyEtb,
    ).toBe('70000.00');
  });

  it('takes the earliest promise when a project has two signed contracts', () => {
    expect(
      deliveryCountdown(
        [
          signed({ deliveryDays: 120 }),
          signed({ signedAt: '2026-09-17' }),
        ],
        '2026-10-02',
      ).deliveryDueDate,
    ).toBe('2027-01-21');
  });

  it('is blank with no signed contract carrying a delivery period', () => {
    expect(deliveryCountdown([], '2026-10-02')).toEqual({
      deliveryDueDate: null,
      deliveryDaysLeft: null,
      deliveryPenaltyEtb: null,
    });
  });
});
