import { normalizeEthiopic } from '../../common/text/ethiopic-normalize';
import { ProjectsRepository } from './projects.repository';

// Pulls the column name out of a drizzle asc()/desc() SQL wrapper — same
// queryChunks shape as above, used to assert the PK tiebreaker is actually
// present in orderBy() without needing a real column/table object.
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
    insertChain.returning = jest.fn(() =>
      Promise.resolve([{ id: 'p1' }]),
    );
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
