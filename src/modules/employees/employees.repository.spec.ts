import { EmployeesRepository } from './employees.repository';

// The password-reset DB write lives in EmployeesRepository.update() because
// nulling refreshTokenHash must happen in the same UPDATE statement as the
// passwordHash write — a separate call could race with a concurrent login.

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
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select, update }),
  );
  const repo = new EmployeesRepository({ withTenant } as never);
  return { repo, select, update, updateChain };
};

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
