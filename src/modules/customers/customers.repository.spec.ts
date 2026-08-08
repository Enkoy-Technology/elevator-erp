import { NotFoundException } from '@nestjs/common';

import { CustomerInUseError } from '../../common/exceptions';
import { CustomersRepository } from './customers.repository';

// The dependent-record guard and the soft-delete write both have to run in
// the same tenant transaction as the counts they depend on (see
// TenantDbService.withTenant), so — like the last-admin guard in
// EmployeesRepository — this is a repository-level test, not a service one.

type Row = Record<string, unknown>;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';

const makeCountChain = (value: number) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => Promise.resolve([{ value }]));
  return chain;
};

const makeUpdateChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

/** Wires a fake tenant transaction: the three `select` calls (projects,
 * assets, maintenance contracts, in that order) resolve to `counts`, and the
 * `update` call resolves to `updateRows`. */
const repoWithTx = (counts: [number, number, number], updateRows: Row[]) => {
  const select = jest.fn();
  counts.forEach((value) => select.mockReturnValueOnce(makeCountChain(value)));
  const updateChain = makeUpdateChain(updateRows);
  const update = jest.fn(() => updateChain);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select, update }),
  );
  const repo = new CustomersRepository({ withTenant } as never);
  return { repo, select, update, updateChain };
};

describe('CustomersRepository.softDelete — dependent-record guard', () => {
  it('refuses to delete a customer with linked projects, assets or contracts', async () => {
    const { repo, update } = repoWithTx([2, 1, 0], []);

    await expect(repo.softDelete(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
      'Cannot delete a customer with 2 linked project(s), 1 linked asset(s) and 0 linked maintenance contract(s).',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects with CustomerInUseError specifically', async () => {
    const { repo } = repoWithTx([0, 0, 1], []);

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).rejects.toBeInstanceOf(CustomerInUseError);
  });

  it('deletes a customer with no linked records', async () => {
    const { repo, updateChain } = repoWithTx(
      [0, 0, 0],
      [{ id: CUSTOMER_ID }],
    );

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).resolves.toBeUndefined();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it('still 404s a customer that does not exist once dependents are clear', async () => {
    const { repo } = repoWithTx([0, 0, 0], []);

    await expect(
      repo.softDelete(TENANT_ID, CUSTOMER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
