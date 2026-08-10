import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import { QuotationsRepository } from './quotations.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const QUOTE_ID = '44444444-4444-4444-4444-444444444444';

/** Wires a fake `update().set().where().returning()` chain. */
const makeUpdateChain = (
  onWhere: (w: unknown) => void,
  returning: unknown[],
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn((w: unknown) => {
    onWhere(w);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `select().from().where().limit()` chain, for the
 * exists-check the CAS miss path runs. */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

describe('QuotationsRepository.updateStatus — compare-and-swap', () => {
  it('includes the expected-status equality in the update WHERE clause', async () => {
    let where: unknown;
    const updateChain = makeUpdateChain(
      (w) => (where = w),
      [{ id: QUOTE_ID, status: 'PENDING_APPROVAL' }],
    );
    const update = jest.fn(() => updateChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL');

    expect(where).toBeDefined();
  });

  it('throws WorkflowTransitionError (409) when the row exists but is no longer in the expected status', async () => {
    const updateChain = makeUpdateChain(() => {}, []);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([{ id: QUOTE_ID }]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws NotFoundException when the row does not exist at all', async () => {
    const updateChain = makeUpdateChain(() => {}, []);
    const update = jest.fn(() => updateChain);
    const selectChain = makeSelectChain([]);
    const select = jest.fn(() => selectChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new QuotationsRepository({ withTenant } as never);

    await expect(
      repo.updateStatus(TENANT_ID, QUOTE_ID, 'DRAFT', 'PENDING_APPROVAL'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
