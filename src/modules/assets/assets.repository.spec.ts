import { AssetsRepository } from './assets.repository';

// Pulls the column name out of a drizzle asc()/desc() SQL wrapper —
// see the identical helper in customers.repository.spec.ts for the general
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

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

describe('AssetsRepository.streamAll — orderBy tiebreaker', () => {
  it('breaks ties on id, so rows sharing a createdAt cannot be duplicated/skipped across batches', async () => {
    // streamAll() now joins customers for the display name (REC 5), so the
    // chain must tolerate a leftJoin() call in addition to the plain select.
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn(() => chain);
    chain.leftJoin = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.orderBy = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn(() => chain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new AssetsRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, {});
    await gen.next();

    const orderByArgs = chain.orderBy.mock.calls[0] as unknown[];
    expect(orderByArgs).toHaveLength(2);
    expect(extractOrderByColumnNames(orderByArgs[1])).toContain('id');
  });
});

describe('AssetsRepository.streamAll — customer display name (REC 5)', () => {
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
    const repo = new AssetsRepository({ withTenant } as never);

    const gen = repo.streamAll(TENANT_ID, {});
    await gen.next();

    expect(joinedWith).toBeDefined();
    expect(selectedShape).toHaveProperty('customerName');
    expect(selectedShape).not.toHaveProperty('customerId');

    // The join's `on` condition must compare tenantId on both sides (not
    // just the FK-to-id equality) — defense in depth so a cross-tenant
    // customer row can never be joined even if RLS were somehow bypassed.
    // `tenant_id` (the DB column name) should appear twice: once per side
    // of the `eq()`.
    const columnNames = extractOrderByColumnNames(joinedWith);
    expect(columnNames.filter((n) => n === 'tenant_id')).toHaveLength(2);
  });
});
