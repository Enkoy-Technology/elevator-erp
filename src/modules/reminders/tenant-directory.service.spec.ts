import { TenantDirectoryService } from './tenant-directory.service';

describe('TenantDirectoryService.listActiveTenantIds', () => {
  it('maps the SECURITY DEFINER function rows to a plain id array', async () => {
    const execute = jest.fn(async () => ({
      rows: [{ id: 't1' }, { id: 't2' }],
    }));
    const service = new TenantDirectoryService({ execute } as never);

    await expect(service.listActiveTenantIds()).resolves.toEqual(['t1', 't2']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when no tenants exist', async () => {
    const execute = jest.fn(async () => ({ rows: [] }));
    const service = new TenantDirectoryService({ execute } as never);

    await expect(service.listActiveTenantIds()).resolves.toEqual([]);
  });
});
