import { LastAdminError } from '../../common/exceptions';
import { EmployeesRepository } from './employees.repository';

// The last-admin guard and the password-reset DB write both live in
// EmployeesRepository.update() because the guard's count-then-update must
// run inside the same tenant transaction as the read it depends on (see
// TenantDbService.withTenant), and nulling refreshTokenHash must happen in
// the same UPDATE statement as the passwordHash write. That means the
// logic — and these tests — live at the repository layer, not the service
// layer.

type Row = Record<string, unknown>;

const makeSelectChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const makeUpdateChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_ID = '33333333-3333-3333-3333-333333333333';

const sampleRow = (overrides: Row = {}): Row => ({
  id: TARGET_ID,
  email: 'admin@shiningstar.et',
  fullName: 'Abebe Kebede',
  phone: null,
  role: 'ADMIN',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

/** Wires a fake tenant transaction whose `select` calls resolve, in order,
 * to `selectResults`, and whose single `update` call resolves to
 * `updateRows`. */
const repoWithTx = (selectResults: Row[][], updateRows: Row[]) => {
  const select = jest.fn();
  selectResults.forEach((rows) =>
    select.mockReturnValueOnce(makeSelectChain(rows)),
  );
  const updateChain = makeUpdateChain(updateRows);
  const update = jest.fn(() => updateChain);
  const execute = jest.fn(() => Promise.resolve());
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select, update, execute }),
  );
  const repo = new EmployeesRepository({ withTenant } as never);
  return { repo, select, update, updateChain, execute };
};

describe('EmployeesRepository.update — last-admin guard', () => {
  it('rejects deactivating the last active ADMIN', async () => {
    const { repo, update, execute } = repoWithTx(
      [[{ role: 'ADMIN', isActive: true }], []],
      [],
    );

    await expect(
      repo.update(TENANT_ID, TARGET_ID, { isActive: false }),
    ).rejects.toBeInstanceOf(LastAdminError);
    expect(update).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects demoting the last active CEO', async () => {
    const { repo, update } = repoWithTx(
      [[{ role: 'CEO', isActive: true }], []],
      [],
    );

    await expect(
      repo.update(TENANT_ID, TARGET_ID, { role: 'SALES_MANAGER' }),
    ).rejects.toBeInstanceOf(LastAdminError);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows deactivating an admin when another active admin-capable user exists', async () => {
    const updatedRow = sampleRow({ isActive: false });
    const { repo, update } = repoWithTx(
      [[{ role: 'ADMIN', isActive: true }], [{ id: 'other-admin-id' }]],
      [updatedRow],
    );

    await expect(
      repo.update(TENANT_ID, TARGET_ID, { isActive: false }),
    ).resolves.toEqual(updatedRow);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips the guard query and the advisory lock when neither role nor isActive changes', async () => {
    const updatedRow = sampleRow({ fullName: 'New Name' });
    const { repo, select, update, execute } = repoWithTx([], [updatedRow]);

    await expect(
      repo.update(TENANT_ID, TARGET_ID, { fullName: 'New Name' }),
    ).resolves.toEqual(updatedRow);
    expect(select).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('EmployeesRepository.update — password reset', () => {
  it('nulls refreshTokenHash in the same UPDATE that sets passwordHash', async () => {
    const updatedRow = sampleRow();
    const { repo, updateChain } = repoWithTx([], [updatedRow]);

    await repo.update(TENANT_ID, TARGET_ID, {
      passwordHash: '$2b$12$stubhash',
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: '$2b$12$stubhash',
        refreshTokenHash: null,
      }),
    );
  });

  it('leaves passwordHash and refreshTokenHash untouched when no password is given', async () => {
    const updatedRow = sampleRow();
    const { repo, updateChain } = repoWithTx([], [updatedRow]);

    await repo.update(TENANT_ID, TARGET_ID, { fullName: 'New Name' });

    const setArgs = updateChain.set!.mock.calls[0]?.[0] as Row;
    expect(setArgs).not.toHaveProperty('passwordHash');
    expect(setArgs).not.toHaveProperty('refreshTokenHash');
  });
});
