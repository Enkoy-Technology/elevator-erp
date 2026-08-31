import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CalcResult } from '../elevator-calc/types';
import type { QuotationRecord } from './quotations.repository';
import { QuotationsService } from './quotations.service';

describe('QuotationsService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const project = {
    id: '55555555-5555-5555-5555-555555555555',
    customerId: '66666666-6666-6666-6666-666666666666',
  };

  const draft: QuotationRecord = {
    tenantId: user.tenantId,
    id: '44444444-4444-4444-4444-444444444444',
    projectId: project.id,
    customerId: project.customerId,
    quoteNumber: 'QTN-2026-ABCD1234',
    status: 'DRAFT',
    version: 1,
    calcInput: {},
    technicalSpec: {},
    pricingBreakdown: {},
    rateVersionId: '77777777-7777-7777-7777-777777777777',
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
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: user.userId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  };
  const calc = { calculateSpecs: jest.fn() };
  const projectsService = { getById: jest.fn() };
  const rates = { resolve: jest.fn() };

  const service = new QuotationsService(
    repo as never,
    calc,
    projectsService as never,
    rates as never,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('createForProject', () => {
    const calcResult: CalcResult = {
      technical: { capacityPersons: 13 } as CalcResult['technical'],
      pricing: {
        // PASSENGER, 5 stops (floors to 0), 1000 kg: 7,000,000 + 370,000
        basePrice: '7000000.00',
        stopsAdjustment: '0.00',
        capacityAdjustment: '370000.00',
        totalBeforeMargin: '7370000.00',
        marginAmount: '1842500.00',
        subtotalWithMargin: '9212500.00',
        // Placeholders from calc's own (unused, taxPercent=0) math — the
        // service must overwrite these with the VAT-resolved figures.
        taxAmount: '0.00',
        totalPrice: '9212500.00',
      },
    };

    const dto = {
      productType: 'PASSENGER',
      capacityKg: 1000,
      stops: 5,
      travelHeightM: 15,
      speedMs: 1.6,
      machineRoomType: 'MRL',
      doorType: 'CENTER_OPEN',
      doorWidthMm: 900,
      buildingUsage: 'COMMERCIAL',
      marginPercent: 25,
    } as never;

    beforeEach(() => {
      projectsService.getById.mockResolvedValue(project);
      calc.calculateSpecs.mockReturnValue(calcResult);
      rates.resolve.mockResolvedValue({
        id: '77777777-7777-7777-7777-777777777777',
        kind: 'VAT',
        validFrom: '2024-08-21',
        validTo: null,
        payload: { percent: '15' },
      });
      repo.create.mockResolvedValue(draft);
    });

    it('resolves VAT from RatesService (never a client-supplied or hardcoded percent) and stores the rate version', async () => {
      await service.createForProject(user, project.id, dto);

      expect(rates.resolve).toHaveBeenCalledWith(
        'VAT',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      const [, values] = repo.create.mock.calls[0]!;
      expect(values.rateVersionId).toBe('77777777-7777-7777-7777-777777777777');
    });

    it('computes tax/total off the resolved VAT percent with decimal.js, not calc\'s placeholder', async () => {
      await service.createForProject(user, project.id, dto);

      const [, values] = repo.create.mock.calls[0]!;
      // 9,212,500.00 * 15% = 1,381,875.00; total = 10,594,375.00
      expect(values.taxAmountEtb).toBe('1381875.00');
      expect(values.totalPriceEtb).toBe('10594375.00');
      expect(values.taxPercent).toBe('15.00');
      expect(values.pricingBreakdown.taxAmount).toBe('1381875.00');
      expect(values.pricingBreakdown.totalPrice).toBe('10594375.00');
    });

    it('never passes the client a way to set taxPercent — calc is called with a 0 placeholder', async () => {
      await service.createForProject(user, project.id, dto);
      expect(calc.calculateSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ taxPercent: 0 }),
      );
    });

    it('creates the quotation as DRAFT under the calling project/customer', async () => {
      const result = await service.createForProject(user, project.id, dto);
      expect(result).toEqual(draft);
      const [tenantId, values] = repo.create.mock.calls[0]!;
      expect(tenantId).toBe(user.tenantId);
      expect(values.status).toBe('DRAFT');
      expect(values.projectId).toBe(project.id);
      expect(values.customerId).toBe(project.customerId);
    });
  });

  describe('transitions', () => {
    it('submits a DRAFT quote to PENDING_APPROVAL', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockResolvedValue({
        ...draft,
        status: 'PENDING_APPROVAL',
      });
      await expect(service.submit(user, draft.id)).resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
      });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'DRAFT',
        'PENDING_APPROVAL',
        {},
      );
    });

    it('approves a PENDING_APPROVAL quote and stamps approvedByUserId', async () => {
      const pending = { ...draft, status: 'PENDING_APPROVAL' as const };
      repo.findById.mockResolvedValue(pending);
      repo.updateStatus.mockResolvedValue({ ...pending, status: 'APPROVED' });
      await expect(service.approve(user, draft.id)).resolves.toMatchObject({
        status: 'APPROVED',
      });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'PENDING_APPROVAL',
        'APPROVED',
        expect.objectContaining({ approvedByUserId: user.userId }),
      );
    });

    it('rejects skipping submission (DRAFT → APPROVED)', async () => {
      repo.findById.mockResolvedValue(draft);
      await expect(service.approve(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects a PENDING_APPROVAL quote with a reason', async () => {
      const pending = { ...draft, status: 'PENDING_APPROVAL' as const };
      repo.findById.mockResolvedValue(pending);
      repo.updateStatus.mockResolvedValue({
        ...pending,
        status: 'REJECTED',
        rejectedReason: 'Too expensive',
      });
      await expect(
        service.reject(user, draft.id, 'Too expensive'),
      ).resolves.toMatchObject({ status: 'REJECTED' });
      expect(repo.updateStatus).toHaveBeenCalledWith(
        user.tenantId,
        draft.id,
        'PENDING_APPROVAL',
        'REJECTED',
        { rejectedReason: 'Too expensive' },
      );
    });

    it('expires a DRAFT quote', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockResolvedValue({ ...draft, status: 'EXPIRED' });
      await expect(service.expire(user, draft.id)).resolves.toMatchObject({
        status: 'EXPIRED',
      });
    });

    it('cannot resurrect a REJECTED quote', async () => {
      repo.findById.mockResolvedValue({ ...draft, status: 'REJECTED' as const });
      await expect(service.approve(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
    });

    it('propagates a 409 WorkflowTransitionError from a concurrent CAS conflict', async () => {
      // The repository does the actual compare-and-swap; simulate someone
      // else moving the row between our read and our write.
      repo.findById.mockResolvedValue(draft);
      repo.updateStatus.mockRejectedValue(
        new WorkflowTransitionError(
          'Quotation status changed concurrently — reload and retry',
        ),
      );
      await expect(service.submit(user, draft.id)).rejects.toBeInstanceOf(
        WorkflowTransitionError,
      );
    });

    it('throws NotFoundException for a missing quote', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.submit(user, draft.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
