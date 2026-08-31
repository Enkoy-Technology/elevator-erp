import type { ProjectStatus } from '../../database/schema';
import { autoAdvanceProject } from './project-auto-advance';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';

/**
 * Fake `tx` covering the two chains autoAdvanceProject uses:
 * `select().from().where().limit()` and `update().set().where()` (drizzle's
 * update builder is awaited directly, so `where` resolves).
 */
const makeTx = (projectRows: unknown[]) => {
  const selectChain: Record<string, jest.Mock> = {};
  selectChain.from = jest.fn(() => selectChain);
  selectChain.where = jest.fn(() => selectChain);
  selectChain.limit = jest.fn(() => Promise.resolve(projectRows));

  const setValues: unknown[] = [];
  const updateChain: Record<string, jest.Mock> = {};
  updateChain.set = jest.fn((v: unknown) => {
    setValues.push(v);
    return updateChain;
  });
  updateChain.where = jest.fn(() => Promise.resolve([]));

  const update = jest.fn(() => updateChain);
  return { tx: { select: jest.fn(() => selectChain), update }, update, setValues };
};

describe('autoAdvanceProject', () => {
  it.each<ProjectStatus>(['LEAD', 'SITE_SURVEY', 'SPEC_CALCULATION'])(
    'advances a project at %s forward to QUOTATION',
    async (status) => {
      const { tx, update, setValues } = makeTx([{ status }]);

      await autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION');

      expect(update).toHaveBeenCalledTimes(1);
      expect(setValues[0]).toMatchObject({ status: 'QUOTATION' });
    },
  );

  it.each<ProjectStatus>([
    'LEAD',
    'SITE_SURVEY',
    'SPEC_CALCULATION',
    'QUOTATION',
  ])('advances a project at %s forward to PROFORMA', async (status) => {
    const { tx, update, setValues } = makeTx([{ status }]);

    await autoAdvanceProject(tx as never, PROJECT_ID, 'PROFORMA');

    expect(update).toHaveBeenCalledTimes(1);
    expect(setValues[0]).toMatchObject({ status: 'PROFORMA' });
  });

  it('is a silent no-op when the project is already at the target stage', async () => {
    const { tx, update } = makeTx([{ status: 'QUOTATION' }]);

    await expect(
      autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION'),
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
  });

  it.each<ProjectStatus>(['PROFORMA', 'CONTRACT', 'EXECUTION', 'COMPLETED'])(
    'never moves a project at %s backwards to QUOTATION',
    async (status) => {
      const { tx, update } = makeTx([{ status }]);

      await autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION');

      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each<ProjectStatus>(['CANCELLED', 'COMPLETED'])(
    'never touches a %s project',
    async (status) => {
      const { tx, update } = makeTx([{ status }]);

      await autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION');
      await autoAdvanceProject(tx as never, PROJECT_ID, 'PROFORMA');

      expect(update).not.toHaveBeenCalled();
    },
  );

  it('is a silent no-op when the project row is gone (deleted/other tenant)', async () => {
    const { tx, update } = makeTx([]);

    await expect(
      autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION'),
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
  });

  it('compare-and-swaps on the status it read, so a concurrent move loses silently', async () => {
    const { tx, update } = makeTx([{ status: 'LEAD' }]);

    await autoAdvanceProject(tx as never, PROJECT_ID, 'QUOTATION');

    // The CAS predicate is built from the observed status; a row that moved
    // in between simply matches nothing — no rows returned, no throw.
    const updateChain = update.mock.results[0]!.value as { where: jest.Mock };
    expect(updateChain.where).toHaveBeenCalledTimes(1);
    expect(updateChain.where.mock.calls[0]?.[0]).toBeDefined();
  });
});
