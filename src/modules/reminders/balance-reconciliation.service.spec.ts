import { BalanceReconciliationService } from './balance-reconciliation.service';

const TENANT_ID = 't1';

const build = (
  reconcileAllResult: {
    customersChecked: number;
    mismatches: { customerId: string; customerName: string; storedEtb: string; correctedEtb: string }[];
  },
) => {
  const tenantDirectory = { listActiveTenantIds: jest.fn(async () => [TENANT_ID]) };
  const reconciliationRepository = {
    reconcileAll: jest.fn(async () => reconcileAllResult),
    recordRunResult: jest.fn(async () => undefined),
  };
  const service = new BalanceReconciliationService(
    tenantDirectory as never,
    reconciliationRepository as never,
  );
  return { service, tenantDirectory, reconciliationRepository };
};

describe('BalanceReconciliationService.runNightlyReconciliation', () => {
  it('logs a deliberately-corrupted stored balance loudly with BOTH values', async () => {
    const { service, reconciliationRepository } = build({
      customersChecked: 1,
      mismatches: [
        {
          customerId: 'c1',
          customerName: 'Addis Heights PLC',
          storedEtb: '999.99',
          correctedEtb: '500.00',
        },
      ],
    });
    const errorSpy = jest
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    await service.runNightlyReconciliation();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/stored 999\.99.*derived 500\.00/),
    );
    expect(reconciliationRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 1);
  });

  it('records a clean run (0 mismatches) without logging any error', async () => {
    const { service, reconciliationRepository } = build({
      customersChecked: 5,
      mismatches: [],
    });
    const errorSpy = jest
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    await service.runNightlyReconciliation();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(reconciliationRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 0);
  });

  it('a tenant whose reconciliation throws does not stop other tenants from being processed', async () => {
    const { service, tenantDirectory, reconciliationRepository } = build({
      customersChecked: 1,
      mismatches: [],
    });
    tenantDirectory.listActiveTenantIds.mockResolvedValue(['bad-tenant', TENANT_ID]);
    reconciliationRepository.reconcileAll
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ customersChecked: 1, mismatches: [] });

    await expect(service.runNightlyReconciliation()).resolves.toBeUndefined();
    expect(reconciliationRepository.recordRunResult).toHaveBeenCalledTimes(1);
    expect(reconciliationRepository.recordRunResult).toHaveBeenCalledWith(TENANT_ID, 0);
  });
});
