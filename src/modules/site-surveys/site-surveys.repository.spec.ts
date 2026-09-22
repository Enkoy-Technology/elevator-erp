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
