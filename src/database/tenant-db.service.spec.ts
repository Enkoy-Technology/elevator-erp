import { TenantIsolationError } from '../common/exceptions';
import type { Database } from './database.types';
import { TenantDbService } from './tenant-db.service';

describe('TenantDbService', () => {
  const executeMock = jest.fn();
  const transactionMock = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ execute: executeMock }),
  );
  const db = { transaction: transactionMock } as unknown as Database;
  const service = new TenantDbService(db);

  const TENANT_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  it('rejects malformed tenant ids before touching the database', async () => {
    await expect(
      service.withTenant('not-a-uuid', async () => 'never'),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects SQL-injection-shaped tenant ids', async () => {
    await expect(
      service.withTenant(`${TENANT_ID}'; DROP TABLE users; --`, async () => 1),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('sets tenant context inside a transaction and returns the result', async () => {
    const result = await service.withTenant(TENANT_ID, async () => 42);

    expect(result).toBe(42);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const query = executeMock.mock.calls[0]?.[0] as {
      queryChunks: unknown[];
    };
    expect(JSON.stringify(query.queryChunks)).toContain('set_tenant_context');
  });
});
