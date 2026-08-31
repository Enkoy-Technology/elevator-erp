import { NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { ProformaRecord } from './proformas.repository';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const issued: ProformaRecord = {
    tenantId: user.tenantId,
    id: '88888888-8888-8888-8888-888888888888',
    quotationId: '44444444-4444-4444-4444-444444444444',
    projectId: '55555555-5555-5555-5555-555555555555',
    customerId: '66666666-6666-6666-6666-666666666666',
    proformaNumber: 'PF-FY2026-27-0001',
    fiscalYearLabel: 'FY2026/27',
    subtotalEtb: '100.00',
    vatEtb: '15.00',
    totalEtb: '115.00',
    rateVersionId: '77777777-7777-7777-7777-777777777777',
    technicalSpec: { capacityPersons: 13 },
    pricingBreakdown: { baseCost: '80.00' },
    issuedAt: new Date('2026-08-08T00:00:00.000Z'),
    issuedByUserId: user.userId,
    validUntil: null,
    status: 'ISSUED',
    cancelReason: null,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
  };

  const repo = {
    list: jest.fn(),
    streamAll: jest.fn(),
    findById: jest.fn(),
    issue: jest.fn(),
    cancel: jest.fn(),
  };

  const service = new ProformasService(repo as never);

  beforeEach(() => jest.clearAllMocks());

  it('issueFromQuotation() delegates straight to repo.issue() with the caller and quotation id', async () => {
    repo.issue.mockResolvedValue(issued);
    await expect(
      service.issueFromQuotation(user, issued.quotationId, '2026-09-30'),
    ).resolves.toEqual(issued);
    expect(repo.issue).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      issued.quotationId,
      '2026-09-30',
    );
  });

  it('issueFromQuotation() passes null when no validUntil was supplied', async () => {
    repo.issue.mockResolvedValue(issued);
    await service.issueFromQuotation(user, issued.quotationId, undefined);
    expect(repo.issue).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      issued.quotationId,
      null,
    );
  });

  it('cancel() delegates to repo.cancel() and never touches the quotation — cancelling a proforma does not revert its source quote', async () => {
    const cancelled = { ...issued, status: 'CANCELLED' as const, cancelReason: 'Client withdrew' };
    repo.cancel.mockResolvedValue(cancelled);
    await expect(
      service.cancel(user, issued.id, 'Client withdrew'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(repo.cancel).toHaveBeenCalledWith(
      user.tenantId,
      issued.id,
      'Client withdrew',
    );
    // ProformasService holds no reference to QuotationsRepository/Service at
    // all (see proformas.module.ts) — there is no call path by which cancel()
    // could touch the quotations table, so "keeps quotation state" is a
    // structural guarantee, not just a behavioral one asserted here.
    expect(Object.keys(service)).not.toContain('quotationsService');
  });

  it('getById() 404s on a missing proforma', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.getById(user, issued.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById() returns the row when found', async () => {
    repo.findById.mockResolvedValue(issued);
    await expect(service.getById(user, issued.id)).resolves.toEqual(issued);
  });
});
