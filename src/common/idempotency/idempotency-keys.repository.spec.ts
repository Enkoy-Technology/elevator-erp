import {
  IdempotencyKeyConflictError,
  IdempotencyKeyInProgressError,
} from '../exceptions';
import { IdempotencyKeysRepository } from './idempotency-keys.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

/** Wires a fake `insert().values().onConflictDoUpdate().returning()` chain. */
const makeUpsertChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoUpdate = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** A fake select chain, also "thenable" — same shape as the other repository specs' own copy. */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const makeUpdateChain = () => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => Promise.resolve(undefined));
  return chain;
};

const makeRepo = (tx: Record<string, unknown>) => {
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  );
  return { repo: new IdempotencyKeysRepository({ withTenant } as never), withTenant };
};

describe('IdempotencyKeysRepository.claim', () => {
  it('wins the claim on a fresh insert (no conflicting row)', async () => {
    const insert = jest.fn().mockReturnValueOnce(makeUpsertChain([{ id: 'row-1' }]));
    const { repo } = makeRepo({ insert });

    const result = await repo.claim(TENANT_ID, 'key-1', 'PaymentsController#record', 'fp-1');

    expect(result).toEqual({ kind: 'won' });
  });

  it('replays the stored response when a conflicting row has a MATCHING fingerprint and a completed response', async () => {
    const insert = jest.fn().mockReturnValueOnce(makeUpsertChain([]));
    const select = jest.fn().mockReturnValueOnce(
      makeSelectChain([
        { fingerprint: 'fp-1', responseStatus: 201, responseBody: { id: 'receipt-1' } },
      ]),
    );
    const { repo } = makeRepo({ insert, select });

    const result = await repo.claim(TENANT_ID, 'key-1', 'PaymentsController#record', 'fp-1');

    expect(result).toEqual({ kind: 'replay', status: 201, body: { id: 'receipt-1' } });
  });

  it('409s as a conflict when a conflicting row has a DIFFERENT fingerprint', async () => {
    const insert = jest.fn().mockReturnValueOnce(makeUpsertChain([]));
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([
          { fingerprint: 'fp-OTHER', responseStatus: 201, responseBody: { id: 'x' } },
        ]),
      );
    const { repo } = makeRepo({ insert, select });

    await expect(
      repo.claim(TENANT_ID, 'key-1', 'PaymentsController#record', 'fp-1'),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
  });

  it('409s as in-progress when a conflicting row matches the fingerprint but has no response yet', async () => {
    const insert = jest.fn().mockReturnValueOnce(makeUpsertChain([]));
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ fingerprint: 'fp-1', responseStatus: null, responseBody: null }]),
      );
    const { repo } = makeRepo({ insert, select });

    await expect(
      repo.claim(TENANT_ID, 'key-1', 'PaymentsController#record', 'fp-1'),
    ).rejects.toBeInstanceOf(IdempotencyKeyInProgressError);
  });

  it('re-classifies a raw Postgres unique_violation the same as an empty onConflictDoUpdate result', async () => {
    // drizzle-orm/node-postgres shape: the code lives on err.cause, not err
    // itself — same discovery this codebase's other isUniqueViolation
    // copies document (see db-errors.ts / payments.repository.ts).
    const cause: Error & { code?: string } = new Error('duplicate key value');
    cause.code = '23505';
    const err: Error & { cause?: unknown } = new Error('Failed query: insert ...');
    err.cause = cause;
    const insert = jest.fn().mockReturnValueOnce({
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn(() => Promise.reject(err)),
    });
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ fingerprint: 'fp-1', responseStatus: 201, responseBody: { id: 'r' } }]),
      );
    const { repo } = makeRepo({ insert, select });

    const result = await repo.claim(TENANT_ID, 'key-1', 'PaymentsController#record', 'fp-1');
    expect(result).toEqual({ kind: 'replay', status: 201, body: { id: 'r' } });
  });
});

describe('IdempotencyKeysRepository.complete', () => {
  it('writes the response status/body for the claimed (tenant, key)', async () => {
    const update = jest.fn().mockReturnValueOnce(makeUpdateChain());
    const { repo } = makeRepo({ update });

    await repo.complete(TENANT_ID, 'key-1', 201, { id: 'receipt-1' });

    const setCall = (update.mock.results[0]!.value as { set: jest.Mock }).set;
    expect(setCall).toHaveBeenCalledWith({ responseStatus: 201, responseBody: { id: 'receipt-1' } });
  });
});
