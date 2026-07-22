import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { QuotationRecord } from './quotations.repository';
import { QuotationsService } from './quotations.service';

describe('QuotationsService transitions', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
    permissions: [],
  };

  const draft: QuotationRecord = {
    tenantId: user.tenantId,
    id: '44444444-4444-4444-4444-444444444444',
    projectId: '55555555-5555-5555-5555-555555555555',
    customerId: '66666666-6666-6666-6666-666666666666',
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'DRAFT',
    version: 1,
    calcInput: {},
    technicalSpec: {},
    pricingBreakdown: {},
    marginPercent: '25.00',
    taxPercent: '15.00',
    subtotalEtb: '100.00',
    marginAmountEtb: '25.00',
    taxAmountEtb: '18.75',
    totalPriceEtb: '143.75',
    validUntil: null,
    notes: null,
    approvedByUserId: null,
    approvedAt: null,
    rejectedReason: null,
    proformaAt: null,
    contractAt: null,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: user.userId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  const repo = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const service = new QuotationsService(
    repo as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('approves a DRAFT quote and stamps approver', async () => {
    repo.findById.mockResolvedValue(draft);
    repo.updateStatus.mockResolvedValue({ ...draft, status: 'APPROVED' });
    await expect(service.approve(user, draft.id)).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      user.tenantId,
      draft.id,
      'APPROVED',
      expect.objectContaining({ approvedByUserId: user.userId }),
    );
  });

  it('rejects converting a DRAFT straight to PROFORMA', async () => {
    repo.findById.mockResolvedValue(draft);
    await expect(
      service.convertToProforma(user, draft.id),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('allows APPROVED -> PROFORMA -> CONTRACT', async () => {
    repo.findById.mockResolvedValue({ ...draft, status: 'APPROVED' });
    repo.updateStatus.mockResolvedValue({ ...draft, status: 'PROFORMA' });
    await expect(
      service.convertToProforma(user, draft.id),
    ).resolves.toMatchObject({ status: 'PROFORMA' });

    repo.findById.mockResolvedValue({ ...draft, status: 'PROFORMA' });
    repo.updateStatus.mockResolvedValue({ ...draft, status: 'CONTRACT' });
    await expect(
      service.convertToContract(user, draft.id),
    ).resolves.toMatchObject({ status: 'CONTRACT' });
  });

  it('cannot cancel an already-CONTRACT quote', async () => {
    repo.findById.mockResolvedValue({ ...draft, status: 'CONTRACT' });
    await expect(service.cancel(user, draft.id)).rejects.toBeInstanceOf(
      WorkflowTransitionError,
    );
  });

  it('throws NotFoundException for a missing quote', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.approve(user, draft.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
