import { NotFoundException } from '@nestjs/common';

import { todayIso } from '../../common/business-time';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { ContractsRepository } from './contracts.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROFORMA_ID = '33333333-3333-3333-3333-333333333333';
const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';
const CONTRACT_ID = '88888888-8888-8888-8888-888888888888';

const proformaRow = {
  id: PROFORMA_ID,
  status: 'ISSUED',
  projectId: PROJECT_ID,
  customerId: CUSTOMER_ID,
  totalEtb: '4500000.00',
};

/** Fake `select().from().where().limit()` chain (orderBy/offset chainable too). */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.offset = jest.fn(() => Promise.resolve(rows));
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

/** Fake `update().set().where().returning()` chain, capturing the SET patch. */
const makeUpdateChain = (
  returning: unknown[],
  onSet?: (patch: Record<string, unknown>) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn((patch: Record<string, unknown>) => {
    onSet?.(patch);
    return chain;
  });
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Fake `insert().values().onConflictDoUpdate?().returning()` chain. */
const makeInsertChain = (
  returning: unknown[],
  onValues?: (v: Record<string, unknown>) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: Record<string, unknown>) => {
    onValues?.(v);
    return chain;
  });
  chain.onConflictDoUpdate = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

const repoWith = (tx: Record<string, unknown>): ContractsRepository => {
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
  );
  return new ContractsRepository({ withTenant } as never);
};

describe('ContractsRepository.issueFromProforma — claim the number, copy the snapshot', () => {
  it('claims the next gapless CONTRACT number for the fiscal year and copies the proforma onto a DRAFT', async () => {
    // 1) the proforma, 2) "does a contract already exist", 3) the tenant's
    // fiscal-year boundary.
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    let inserted: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeInsertChain([{ lastValue: 7 }]))
      .mockReturnValueOnce(
        makeInsertChain([{ id: CONTRACT_ID }], (v) => (inserted = v)),
      );

    await repoWith({ select, insert }).issueFromProforma(
      TENANT_ID,
      USER_ID,
      PROFORMA_ID,
    );

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(inserted.contractNumber).toBe(
      `CNT-${fy.label.replace('/', '-')}-0007`,
    );
    expect(inserted.fiscalYearLabel).toBe(fy.label);
    // Denormalised at issue time — a copy, never a join back to the proforma.
    expect(inserted.proformaId).toBe(PROFORMA_ID);
    expect(inserted.projectId).toBe(PROJECT_ID);
    expect(inserted.customerId).toBe(CUSTOMER_ID);
    expect(inserted.contractValueEtb).toBe('4500000.00');
    expect(inserted.issuedByUserId).toBe(USER_ID);
    expect(inserted.status).toBe('DRAFT');
  });

  it('does not advance the project — a draft nobody signed is not a CONTRACT-stage project', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(makeInsertChain([{ id: CONTRACT_ID }]));
    const update = jest.fn(() => makeUpdateChain([]));

    await repoWith({ select, insert, update }).issueFromProforma(
      TENANT_ID,
      USER_ID,
      PROFORMA_ID,
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a proforma that is not ISSUED', async () => {
    const select = jest.fn(() =>
      makeSelectChain([{ ...proformaRow, status: 'CANCELLED' }]),
    );
    await expect(
      repoWith({ select }).issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('refuses a second contract on the same proforma, naming the first', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(
        makeSelectChain([{ contractNumber: 'CNT-FY2026-27-0001' }]),
      );
    await expect(
      repoWith({ select }).issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID),
    ).rejects.toThrow('CNT-FY2026-27-0001');
  });

  it('404s on a proforma that does not exist', async () => {
    const select = jest.fn(() => makeSelectChain([]));
    await expect(
      repoWith({ select }).issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ContractsRepository.updateDraft — DRAFT only, and null means clear', () => {
  it('writes only the fields actually supplied, and lets null clear one', async () => {
    let patch: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain([{ id: CONTRACT_ID }], (p) => (patch = p)),
    );

    await repoWith({ update }).updateDraft(TENANT_ID, CONTRACT_ID, {
      scopeOfWork: 'Two passenger elevators.',
      warrantyMonths: null,
    });

    expect(patch.scopeOfWork).toBe('Two passenger elevators.');
    // Explicit null is a real value (clear the field), not "leave alone".
    expect(patch).toHaveProperty('warrantyMonths', null);
    // Absent from the DTO — must not be written at all, or an edit of the
    // scope would silently wipe terms the parties already agreed.
    expect(patch).not.toHaveProperty('termsAndConditions');
  });

  it('refuses to edit a SIGNED contract, naming the status it actually has', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ status: 'SIGNED' }]));

    await expect(
      repoWith({ update, select }).updateDraft(TENANT_ID, CONTRACT_ID, {
        scopeOfWork: 'rewritten after signing',
      }),
    ).rejects.toThrow(/SIGNED, not DRAFT/);
  });

  it('404s when there is no such contract', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([]));
    await expect(
      repoWith({ update, select }).updateDraft(TENANT_ID, CONTRACT_ID, {
        scopeOfWork: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ContractsRepository.sign — DRAFT -> SIGNED, and the project follows', () => {
  it('sets SIGNED with the given date and advances the project to CONTRACT in the same transaction', async () => {
    let patch: Record<string, unknown> = {};
    const signChain = makeUpdateChain(
      [{ id: CONTRACT_ID, projectId: PROJECT_ID }],
      (p) => (patch = p),
    );
    // 2nd update() is autoAdvanceProject's own CAS on the project row.
    const advanceChain = makeUpdateChain([]);
    const update = jest
      .fn()
      .mockReturnValueOnce(signChain)
      .mockReturnValueOnce(advanceChain);
    // autoAdvanceProject reads the project's current stage first.
    const select = jest.fn(() => makeSelectChain([{ status: 'PROFORMA' }]));

    await repoWith({ update, select }).sign(
      TENANT_ID,
      CONTRACT_ID,
      '2026-08-14',
    );

    expect(patch.status).toBe('SIGNED');
    expect(patch.signedAt).toBe('2026-08-14');
    expect(update).toHaveBeenCalledTimes(2);
    expect(advanceChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONTRACT' }),
    );
  });

  it('refuses to sign anything that is not DRAFT', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ status: 'CANCELLED' }]));

    await expect(
      repoWith({ update, select }).sign(TENANT_ID, CONTRACT_ID, '2026-08-14'),
    ).rejects.toThrow(/CANCELLED, not DRAFT/);
    // The CAS matched no rows, so nothing was written and the project was
    // never touched.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('404s when there is no such contract', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([]));
    await expect(
      repoWith({ update, select }).sign(TENANT_ID, CONTRACT_ID, '2026-08-14'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ContractsRepository.cancel', () => {
  it('cancels a DRAFT with its reason', async () => {
    let patch: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain([{ id: CONTRACT_ID }], (p) => (patch = p)),
    );
    await repoWith({ update }).cancel(TENANT_ID, CONTRACT_ID, 'Customer withdrew');
    expect(patch.status).toBe('CANCELLED');
    expect(patch.cancelReason).toBe('Customer withdrew');
  });

  it('refuses to cancel a COMPLETED contract — the handover already happened', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ status: 'COMPLETED' }]));
    await expect(
      repoWith({ update, select }).cancel(TENANT_ID, CONTRACT_ID, 'oops'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });
});

// customerId filter, added for the customer detail page's "View all
// contracts" link. contracts carries its own customer_id FK, so this is a
// plain column filter — no join through projects. list() and streamAll()
// share `whereFor()`, so asserting list()'s WHERE proves both paths.
describe('ContractsRepository.list — customerId filter', () => {
  // Pulls the column names a drizzle WHERE fragment touches — same
  // queryChunks walk used in projects.repository.spec.ts.
  const whereColumnNames = (arg: unknown): string[] => {
    const out: string[] = [];
    const walk = (x: unknown): void => {
      if (!x || typeof x !== 'object') return;
      if (
        'name' in x &&
        typeof (x as { name?: unknown }).name === 'string' &&
        'table' in x
      ) {
        out.push((x as { name: string }).name);
      }
      if ('queryChunks' in x) {
        for (const chunk of (x as { queryChunks: unknown[] }).queryChunks) {
          walk(chunk);
        }
      }
    };
    walk(arg);
    return out;
  };

  /** Runs list() against a fake tx and returns the column names its WHERE
   * clause actually touches. */
  const whereColumnsFor = async (
    options: Parameters<ContractsRepository['list']>[1],
  ): Promise<string[]> => {
    let where: unknown;
    const countChain: Record<string, jest.Mock> = {};
    countChain.from = jest.fn(() => countChain);
    countChain.where = jest.fn((w: unknown) => {
      where = w;
      return Promise.resolve([{ value: 0 }]);
    });
    // makeSelectChain() resolves at .limit(), but list()'s item query ends
    // in .offset() — so this path needs its own chain.
    const itemsChain: Record<string, jest.Mock> = {};
    itemsChain.from = jest.fn(() => itemsChain);
    itemsChain.leftJoin = jest.fn(() => itemsChain);
    itemsChain.where = jest.fn(() => itemsChain);
    itemsChain.orderBy = jest.fn(() => itemsChain);
    itemsChain.limit = jest.fn(() => itemsChain);
    itemsChain.offset = jest.fn(() => Promise.resolve([]));
    const select = jest.fn();
    select.mockReturnValueOnce(countChain).mockReturnValueOnce(itemsChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new ContractsRepository({ withTenant } as never);
    await repo.list(TENANT_ID, options);
    return whereColumnNames(where);
  };

  it('narrows the query with a customer_id leg when customerId is given', async () => {
    expect(await whereColumnsFor({ customerId: CUSTOMER_ID })).toContain(
      'customer_id',
    );
  });

  it('leaves the query unchanged when customerId is omitted', async () => {
    expect(await whereColumnsFor({})).not.toContain('customer_id');
  });

  it('composes with the projectId filter rather than replacing it', async () => {
    const columns = await whereColumnsFor({
      projectId: PROJECT_ID,
      customerId: CUSTOMER_ID,
    });
    expect(columns).toContain('customer_id');
    expect(columns).toContain('project_id');
  });
});
