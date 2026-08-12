import { OutboxRepository } from './outbox.repository';

// enqueue() has to run in the same tenant transaction as the dedupe
// swallow's fallback SELECT (see TenantDbService.withTenant) — same
// mocking shape as CustomersRepository.softDelete's own fake tenant tx.
// Uses ON CONFLICT DO NOTHING rather than insert-then-catch: a raw insert's
// unique violation aborts the whole Postgres transaction, so a fallback
// SELECT in a catch block never actually runs against real Postgres — see
// outbox.repository.ts's own doc comment and
// test/e2e/outbox-enqueue-dedupe.e2e-spec.ts, which proves the real
// (non-mocked) behavior a mock like this one cannot.

type Row = Record<string, unknown>;

const makeInsertChain = (returningRows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoNothing = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returningRows));
  return chain;
};

const makeSelectChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const repoWithTx = (insertedRows: Row[], existingRows: Row[]) => {
  const insertChain = makeInsertChain(insertedRows);
  const selectChain = makeSelectChain(existingRows);
  const insert = jest.fn(() => insertChain);
  const select = jest.fn(() => selectChain);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ insert, select }),
  );
  const repo = new OutboxRepository({ withTenant } as never);
  return { repo, withTenant, insert, insertChain, select, selectChain };
};

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const VALUES = {
  channel: 'SMS' as const,
  recipient: '+251911234567',
  body: 'Your invoice is due tomorrow.',
  dedupeKey: 'invoice-reminder:abc123:2026-08-08',
};

describe('OutboxRepository.enqueue', () => {
  it('inserts a new message when the dedupeKey has not been used', async () => {
    const insertedRow = { id: 'm1', tenantId: TENANT_ID, ...VALUES };
    const { repo, insertChain, select } = repoWithTx([insertedRow], []);

    const result = await repo.enqueue(TENANT_ID, VALUES);

    expect(insertChain.values).toHaveBeenCalledWith({ tenantId: TENANT_ID, ...VALUES });
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(result).toBe(insertedRow);
  });

  // This IS the idempotency story (task brief 5.4): a reminder job that
  // runs every day, or a caller retrying an HTTP request that already
  // enqueued, must produce one message — a second insert with the same
  // dedupeKey is a no-op that returns the row already there, not an error
  // and not a second SMS. ON CONFLICT DO NOTHING never raises (unlike a raw
  // insert's unique violation would), so the fallback SELECT below runs in
  // a healthy transaction — the e2e test proves this against real Postgres.
  it('falls back to the existing row when the insert conflicts on dedupeKey, instead of inserting twice', async () => {
    const existingRow = { id: 'existing-1', tenantId: TENANT_ID, ...VALUES };
    const { repo, insertChain, select, selectChain } = repoWithTx([], [existingRow]);

    const result = await repo.enqueue(TENANT_ID, VALUES);

    expect(insertChain.values).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toBe(existingRow);
  });

  it('throws if the insert reports a conflict but the fallback SELECT finds nothing (defensive — this table has no DELETE grant)', async () => {
    const { repo } = repoWithTx([], []);

    await expect(repo.enqueue(TENANT_ID, VALUES)).rejects.toThrow(/no existing row/);
  });
});
