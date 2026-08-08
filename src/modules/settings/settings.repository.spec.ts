import { SettingsRepository } from './settings.repository';

// update() has to write tenants.fiscalYearStart in the same tenant
// transaction as the tenantBranding row (1.3.2), but must NOT touch
// `tenants` — and bump its updatedAt — on a branding-only PATCH, since
// `tenants.updatedAt` also carries subscription/billing meaning. Least
// mocking here is a fake tenant transaction whose select/update chains
// return canned rows, matching the pattern in customers.repository.spec.ts.

type Row = Record<string, unknown>;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const makeUpdateChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const makeSelectChain = (rows: Row[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const repoWithTx = (brandingRow: Row, tenantRows: Row[]) => {
  const brandingUpdateChain = makeUpdateChain([brandingRow]);
  const tenantUpdateChain = makeUpdateChain(tenantRows);
  const tenantSelectChain = makeSelectChain(tenantRows);

  let updateCallCount = 0;
  const update = jest.fn(() => {
    updateCallCount += 1;
    return updateCallCount === 1 ? brandingUpdateChain : tenantUpdateChain;
  });
  const select = jest.fn(() => tenantSelectChain);

  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ update, select }),
  );
  const repo = new SettingsRepository({ withTenant } as never);
  return { repo, update, select, tenantUpdateChain, tenantSelectChain };
};

describe('SettingsRepository.update — tenants write scoping', () => {
  const brandingRow: Row = { tenantId: TENANT_ID, primaryColorHex: '#111111' };

  it('writes tenants.fiscalYearStart when the DTO includes it', async () => {
    const { repo, update, tenantUpdateChain, select } = repoWithTx(brandingRow, [
      { fiscalYearStart: '01-01' },
    ]);

    const result = await repo.update(TENANT_ID, { fiscalYearStart: '01-01' });

    expect(update).toHaveBeenCalledTimes(2);
    expect(tenantUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYearStart: '01-01' }),
    );
    expect(select).not.toHaveBeenCalled();
    expect(result.fiscalYearStart).toBe('01-01');
  });

  it('does not write to tenants on a branding-only update — reads the current value instead', async () => {
    const { repo, update, select, tenantSelectChain } = repoWithTx(brandingRow, [
      { fiscalYearStart: '07-08' },
    ]);

    const result = await repo.update(TENANT_ID, { primaryColorHex: '#222222' });

    expect(update).toHaveBeenCalledTimes(1); // branding only, not tenants
    expect(select).toHaveBeenCalled();
    expect(tenantSelectChain.where).toHaveBeenCalled();
    expect(result.fiscalYearStart).toBe('07-08');
  });
});
