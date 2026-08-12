import { OutboxRepository } from './outbox.repository';

// enqueue() has to run in the same tenant transaction as the dedupe
// swallow's fallback SELECT (see TenantDbService.withTenant) — same
// mocking shape as CustomersRepository.softDelete's own fake tenant tx.

type Row = Record<string, unknown>;

/** Mimics `pg`'s DatabaseError shape: a real Error with a Postgres `.code`. */
class MockPgError extends Error {
  constructor(readonly code: string) {
    super(`mock pg error ${code}`);
  }
}

const makeInsertChain = (insertedRow: Row | undefined, insertErrorCode?: string) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.returning = jest.fn(() =>
    insertErrorCode
      ? Promise.reject(new MockPgError(insertErrorCode))
      : Promise.resolve(insertedRow ? [insertedRow] : []),
  );
  return chain;
};

const makeSelectChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const repoWithTx = (
  insertedRow: Row | undefined,
  insertErrorCode: string | undefined,
  existingRows: Row[],
) => {
  const insertChain = makeInsertChain(insertedRow, insertErrorCode);
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
    const { repo, insertChain, select } = repoWithTx(insertedRow, undefined, []);

    const result = await repo.enqueue(TENANT_ID, VALUES);

    expect(insertChain.values).toHaveBeenCalledWith({ tenantId: TENANT_ID, ...VALUES });
    expect(select).not.toHaveBeenCalled();
    expect(result).toBe(insertedRow);
  });

  // This IS the idempotency story (task brief 5.4): a reminder job that
  // runs every day, or a caller retrying an HTTP request that already
  // enqueued, must produce one message — a second insert with the same
  // dedupeKey is a no-op that returns the row already there, not an error
  // and not a second SMS.
  it('swallows a unique-violation on dedupeKey and returns the existing row instead of inserting twice', async () => {
    const existingRow = { id: 'existing-1', tenantId: TENANT_ID, ...VALUES };
    const { repo, insertChain, select, selectChain } = repoWithTx(
      undefined,
      '23505',
      [existingRow],
    );

    const result = await repo.enqueue(TENANT_ID, VALUES);

    expect(insertChain.values).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toBe(existingRow);
  });

  it('does not mask an unrelated insert error as a dedupe swallow', async () => {
    const { repo, select } = repoWithTx(undefined, '23502', []);

    await expect(repo.enqueue(TENANT_ID, VALUES)).rejects.toBeInstanceOf(MockPgError);
    expect(select).not.toHaveBeenCalled();
  });

  it('rethrows the original unique-violation if the row it named cannot be found (defensive — this table has no DELETE grant)', async () => {
    const { repo } = repoWithTx(undefined, '23505', []);

    await expect(repo.enqueue(TENANT_ID, VALUES)).rejects.toBeInstanceOf(MockPgError);
  });
});
