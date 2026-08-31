import {
  InvalidRateTransitionError,
  RateVersionConflictError,
} from '../../common/exceptions';
import { RatesRepository } from './rates.repository';

// rotate() is the whole admin write path: close-old + insert-new must commit
// or fail together, and the validFrom guard has to run against the row it
// just locked, not a value read outside the transaction. Least mocking here
// is a fake `db.transaction` whose select/update/insert chains return canned
// rows, same style as CustomersRepository.softDelete's fake tenant tx.

type Row = Record<string, unknown>;

const makeSelectChain = (openRow: Row | undefined) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(openRow ? [openRow] : []));
  return chain;
};

const makeUpdateChain = () => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => Promise.resolve(undefined));
  return chain;
};

/** Mimics `pg`'s DatabaseError shape: a real Error with a Postgres `.code`. */
class MockPgError extends Error {
  constructor(readonly code: string) {
    super(`mock pg error ${code}`);
  }
}

const makeInsertChain = (insertedRow: Row, insertErrorCode?: string) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.returning = jest.fn(() =>
    insertErrorCode
      ? Promise.reject(new MockPgError(insertErrorCode))
      : Promise.resolve([insertedRow]),
  );
  return chain;
};

const repoWithTx = (
  openRow: Row | undefined,
  insertedRow: Row,
  insertErrorCode?: string,
) => {
  const selectChain = makeSelectChain(openRow);
  const updateChain = makeUpdateChain();
  const insertChain = makeInsertChain(insertedRow, insertErrorCode);

  const select = jest.fn(() => selectChain);
  const update = jest.fn(() => updateChain);
  const insert = jest.fn(() => insertChain);
  const execute = jest.fn(() => Promise.resolve(undefined));

  const transaction = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select, update, insert, execute }),
  );
  const repo = new RatesRepository({ transaction } as never);
  return {
    repo,
    transaction,
    select,
    selectChain,
    update,
    updateChain,
    insert,
    insertChain,
    execute,
  };
};

const OPEN_ROW: Row = {
  id: 'v1',
  kind: 'VAT',
  validFrom: '2024-08-21',
  validTo: null,
  payload: { percent: '15' },
};

describe('RatesRepository.rotate', () => {
  it('takes the per-kind advisory lock before reading the open row', async () => {
    const insertedRow = { id: 'v2', kind: 'VAT', validFrom: '2026-08-08', validTo: null, payload: {} };
    const { repo, execute, select } = repoWithTx(OPEN_ROW, insertedRow);

    await repo.rotate({ kind: 'VAT', validFrom: '2026-08-08', payload: {}, source: 'x' });

    expect(execute).toHaveBeenCalledTimes(1);
    const lockCallOrder = execute.mock.invocationCallOrder[0]!;
    const selectCallOrder = select.mock.invocationCallOrder[0]!;
    expect(lockCallOrder).toBeLessThan(selectCallOrder);
  });

  it('closes the open version and inserts the new one inside a single transaction', async () => {
    const insertedRow = { id: 'v2', kind: 'VAT', validFrom: '2026-08-08', validTo: null, payload: { percent: '16' } };
    const { repo, transaction, updateChain, insertChain } = repoWithTx(OPEN_ROW, insertedRow);

    const result = await repo.rotate({
      kind: 'VAT',
      validFrom: '2026-08-08',
      payload: { percent: '16' },
      source: 'VAT Proclamation X',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith({ validTo: '2026-08-07' });
    expect(insertChain.values).toHaveBeenCalledWith({
      kind: 'VAT',
      validFrom: '2026-08-08',
      payload: { percent: '16' },
      source: 'VAT Proclamation X',
    });
    expect(result).toBe(insertedRow);
  });

  it('rejects a validFrom that is not strictly after the open version’s validFrom with a domain error, not a framework HTTP type', async () => {
    const { repo, update, insert } = repoWithTx(OPEN_ROW, {});

    await expect(
      repo.rotate({
        kind: 'VAT',
        validFrom: OPEN_ROW.validFrom as string,
        payload: {},
        source: 'x',
      }),
    ).rejects.toBeInstanceOf(InvalidRateTransitionError);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a validFrom earlier than the open version’s validFrom', async () => {
    const { repo } = repoWithTx(OPEN_ROW, {});

    await expect(
      repo.rotate({ kind: 'VAT', validFrom: '2020-01-01', payload: {}, source: 'x' }),
    ).rejects.toThrow(InvalidRateTransitionError);
  });

  it('inserts without closing anything when the kind has no open version yet', async () => {
    const insertedRow = { id: 'v1', kind: 'VAT', validFrom: '2026-08-08', validTo: null, payload: {} };
    const { repo, update, insertChain } = repoWithTx(undefined, insertedRow);

    const result = await repo.rotate({
      kind: 'VAT',
      validFrom: '2026-08-08',
      payload: {},
      source: 'x',
    });

    expect(update).not.toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalled();
    expect(result).toBe(insertedRow);
  });

  // Defense in depth (Finding 1): if the unique index is ever hit anyway —
  // the advisory lock should make this unreachable in practice — the raw
  // Postgres 23505 must not surface as an unhandled 500.
  it('reclassifies a unique-violation on insert as RateVersionConflictError', async () => {
    const { repo } = repoWithTx(OPEN_ROW, {}, '23505');

    await expect(
      repo.rotate({ kind: 'VAT', validFrom: '2026-08-08', payload: {}, source: 'x' }),
    ).rejects.toBeInstanceOf(RateVersionConflictError);
  });

  it('does not mask an unrelated insert error as a conflict', async () => {
    const { repo } = repoWithTx(OPEN_ROW, {}, '23502');

    await expect(
      repo.rotate({ kind: 'VAT', validFrom: '2026-08-08', payload: {}, source: 'x' }),
    ).rejects.not.toBeInstanceOf(RateVersionConflictError);
  });
});
