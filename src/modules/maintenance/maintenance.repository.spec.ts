import { MaintenanceRepository } from './maintenance.repository';

// logVisit derives lastServiceAt/nextServiceAt from "today", so the fix for
// the UTC-vs-Addis bug has to be proven at the point the date is stamped,
// not just in the date-math helper. Least mocking here is a fake tenant
// transaction whose select/insert/update chains return canned rows.

type Row = Record<string, unknown>;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const makeTx = (contractRow: Row, visitRow: Row, updatedRow: Row) => {
  const selectChain: Record<string, jest.Mock> = {};
  selectChain.from = jest.fn(() => selectChain);
  selectChain.where = jest.fn(() => selectChain);
  selectChain.limit = jest.fn(() => Promise.resolve([contractRow]));
  const select = jest.fn(() => selectChain);

  const insertChain: Record<string, jest.Mock> = {};
  insertChain.values = jest.fn(() => insertChain);
  insertChain.returning = jest.fn(() => Promise.resolve([visitRow]));
  const insert = jest.fn(() => insertChain);

  const updateChain: Record<string, jest.Mock> = {};
  updateChain.set = jest.fn(() => updateChain);
  updateChain.where = jest.fn(() => updateChain);
  updateChain.returning = jest.fn(() => Promise.resolve([updatedRow]));
  const update = jest.fn(() => updateChain);

  return { select, insert, update, updateChain };
};

const repoWithTx = (contractRow: Row, visitRow: Row, updatedRow: Row) => {
  const tx = makeTx(contractRow, visitRow, updatedRow);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
  );
  const repo = new MaintenanceRepository({ withTenant } as never);
  return { repo, ...tx };
};

describe('MaintenanceRepository.logVisit — Addis Ababa date derivation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stamps lastServiceAt with the Addis calendar date, not the UTC one', async () => {
    // 22:30 UTC on Aug 7 is 01:30 EAT on Aug 8 — already "tomorrow" in Addis.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T22:30:00Z'));

    const contractRow: Row = {
      id: CONTRACT_ID,
      status: 'ACTIVE',
      nextServiceAt: '2026-08-01',
      recurrence: 'MONTHLY',
    };
    const { repo, updateChain } = repoWithTx(
      contractRow,
      { id: 'visit-1' },
      { ...contractRow, lastServiceAt: '2026-08-08', nextServiceAt: '2026-09-01' },
    );

    await repo.logVisit(TENANT_ID, CONTRACT_ID, USER_ID, { notes: undefined });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastServiceAt: '2026-08-08',
        nextServiceAt: '2026-09-01',
      }),
    );
  });
});
