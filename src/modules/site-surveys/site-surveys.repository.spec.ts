import { NotFoundException } from '@nestjs/common';

import { SiteSurveysRepository } from './site-surveys.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const stubTx = () => {
  const chain = {
    from: jest.fn((): unknown => chain),
    leftJoin: jest.fn((): unknown => chain),
    where: jest.fn((_condition?: unknown): unknown => chain),
    orderBy: jest.fn((..._args: unknown[]): unknown => chain),
    limit: jest.fn((_n: number): unknown => chain),
    offset: jest.fn(async (_n: number): Promise<unknown[]> => []),
    // The count query awaits the chain itself (no .offset()); one row of 0.
    then: (resolve: (rows: unknown[]) => void): void => resolve([{ value: 0 }]),
  };
  const select = jest.fn((_shape?: unknown): unknown => chain);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select }),
  );
  return { chain, select, withTenant };
};

describe('SiteSurveysRepository.list', () => {
  it('selects the collector name from the join and pages newest first', async () => {
    const { chain, select, withTenant } = stubTx();
    const repo = new SiteSurveysRepository({ withTenant } as never);

    await repo.list(TENANT_ID, { pageSize: '25' });

    const shape = select.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(shape).toHaveProperty('surveyedByName');
    expect(shape).toHaveProperty('projectName');
    expect(chain.leftJoin).toHaveBeenCalled();
    expect(chain.orderBy.mock.calls[0]).toHaveLength(2);
    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it('filters by surveyor when the caller is scoped, and not otherwise', async () => {
    const scoped = stubTx();
    await new SiteSurveysRepository({
      withTenant: scoped.withTenant,
    } as never).list(TENANT_ID, {
      surveyedByUserId: '11111111-1111-1111-1111-111111111111',
    });
    expect(scoped.chain.where.mock.calls[0]?.[0]).toBeDefined();

    const open = stubTx();
    await new SiteSurveysRepository({
      withTenant: open.withTenant,
    } as never).list(TENANT_ID, {});
    expect(open.chain.where.mock.calls[0]?.[0]).toBeUndefined();
  });
});

/** Every string bound into a drizzle SQL fragment, however deeply nested. */
const boundStrings = (node: unknown, seen = new Set<unknown>()): string[] => {
  if (typeof node === 'string') {
    return [node];
  }
  if (typeof node !== 'object' || node === null || seen.has(node)) {
    return [];
  }
  seen.add(node);
  return Object.values(node as Record<string, unknown>).flatMap((value) =>
    boundStrings(value, seen),
  );
};

describe('SiteSurveysRepository search', () => {
  it('binds the lowercased search pattern into the query', async () => {
    const { chain, withTenant } = stubTx();

    await new SiteSurveysRepository({ withTenant } as never).list(TENANT_ID, {
      search: '  BoLe  ',
    });

    expect(boundStrings(chain.where.mock.calls[0]?.[0])).toContain('%bole%');
  });

  it('ignores a whitespace-only search', async () => {
    const { chain, withTenant } = stubTx();

    await new SiteSurveysRepository({ withTenant } as never).list(TENANT_ID, {
      search: '   ',
    });

    expect(chain.where.mock.calls[0]?.[0]).toBeUndefined();
  });
});

const stubWrite = (rows: unknown[]) => {
  const chain = {
    set: jest.fn((_values?: unknown): unknown => chain),
    where: jest.fn((_condition?: unknown): unknown => chain),
    returning: jest.fn(async (_shape?: unknown) => rows),
  };
  const update = jest.fn((_table?: unknown): unknown => chain);
  const del = jest.fn((_table?: unknown): unknown => chain);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ update, delete: del }),
  );
  return { chain, update, del, withTenant };
};

describe('SiteSurveysRepository.update', () => {
  it('writes only the fields that were sent, plus updatedAt', async () => {
    const { chain, withTenant } = stubWrite([{ id: 'survey-1' }]);

    await new SiteSurveysRepository({ withTenant } as never).update(
      TENANT_ID,
      'survey-1',
      { floors: 'B+G+12', address: null },
    );

    const values = chain.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(values).sort()).toEqual([
      'address',
      'floors',
      'updatedAt',
    ]);
    expect(values.address).toBeNull();
  });

  it('drops a null for a NOT NULL column instead of writing it', async () => {
    const { chain, withTenant } = stubWrite([{ id: 'survey-1' }]);

    await new SiteSurveysRepository({ withTenant } as never).update(
      TENANT_ID,
      'survey-1',
      { projectName: null, surveyDate: null, units: 2 },
    );

    const values = chain.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(values).sort()).toEqual(['units', 'updatedAt']);
  });

  it('is a 404 when the scoped row is not there', async () => {
    const { withTenant } = stubWrite([]);

    await expect(
      new SiteSurveysRepository({ withTenant } as never).update(
        TENANT_ID,
        'survey-1',
        { floors: 'B+G+12' },
        'other-salesperson',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SiteSurveysRepository.delete', () => {
  it('is a 404 when the scoped row is not there', async () => {
    const { withTenant } = stubWrite([]);

    await expect(
      new SiteSurveysRepository({ withTenant } as never).delete(
        TENANT_ID,
        'survey-1',
        'other-salesperson',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the row for a permitted caller', async () => {
    const { del, withTenant } = stubWrite([{ id: 'survey-1' }]);

    await new SiteSurveysRepository({ withTenant } as never).delete(
      TENANT_ID,
      'survey-1',
    );

    expect(del).toHaveBeenCalled();
  });
});
