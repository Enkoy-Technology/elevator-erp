import { BadRequestException, NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser, UserRole } from '../../types/auth.types';
import type { AssetTrackingRepository } from './asset-tracking.repository';
import { AssetTrackingService } from './asset-tracking.service';

const ASSET_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CUSTOMER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const userWith = (role: UserRole): AuthenticatedUser => ({
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role,
});

describe('AssetTrackingService', () => {
  const repository = {
    findAsset: jest.fn(),
    listItems: jest.fn(),
    listEvents: jest.fn(),
    moveStatus: jest.fn(),
    hasMaintenanceRecords: jest.fn(),
    findCustomer: jest.fn(),
    findProject: jest.fn(),
    setSoldTo: jest.fn(),
    updateItem: jest.fn(),
    markCase: jest.fn(),
  };
  const service = new AssetTrackingService(
    repository as unknown as AssetTrackingRepository,
  );
  const liftAt = (status: string, customerId: string | null = CUSTOMER_ID) =>
    repository.findAsset.mockResolvedValue({
      id: ASSET_ID,
      status,
      customerId,
      customerName: customerId ? 'Bole Plaza' : null,
    });

  beforeEach(() => {
    jest.resetAllMocks();
    repository.moveStatus.mockResolvedValue(true);
    repository.hasMaintenanceRecords.mockResolvedValue(false);
    repository.findCustomer.mockResolvedValue({ id: CUSTOMER_ID });
    repository.findProject.mockResolvedValue({
      id: PROJECT_ID,
      customerId: CUSTOMER_ID,
    });
  });

  describe('getTracking', () => {
    it('gives the rows, history and the steps this person may press', async () => {
      liftAt('ON_ORDER', null);
      repository.listItems.mockResolvedValue([{ id: 'row' }]);
      repository.listEvents.mockResolvedValue([{ id: 'event' }]);

      const result = await service.getTracking(
        userWith('STORE_KEEPER'),
        ASSET_ID,
      );

      expect(result.items).toEqual([{ id: 'row' }]);
      expect(result.events).toEqual([{ id: 'event' }]);
      expect(result.nextMoves).toEqual(['CHECKING']);
    });

    it('gives 404 for a lift that does not exist or was deleted', async () => {
      repository.findAsset.mockResolvedValue(null);

      await expect(
        service.getTracking(userWith('STORE_KEEPER'), ASSET_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('move', () => {
    it('gives 404 for a deleted lift', async () => {
      repository.findAsset.mockResolvedValue(null);

      await expect(
        service.move(userWith('STORE_KEEPER'), ASSET_ID, { to: 'CHECKING' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a step that is not this role’s', async () => {
      liftAt('ON_ORDER', null);

      await expect(
        service.move(userWith('TECHNICAL_MANAGER'), ASSET_ID, {
          to: 'CHECKING',
        }),
      ).rejects.toThrow(WorkflowTransitionError);
      expect(repository.moveStatus).not.toHaveBeenCalled();
    });

    it('lets the check finish with parts missing', async () => {
      liftAt('CHECKING', null);
      repository.findAsset
        .mockResolvedValueOnce({
          id: ASSET_ID,
          status: 'CHECKING',
          customerId: null,
        })
        .mockResolvedValueOnce({
          id: ASSET_ID,
          status: 'IN_STORE',
          customerId: null,
        });

      const result = await service.move(userWith('STORE_KEEPER'), ASSET_ID, {
        to: 'IN_STORE',
      });

      expect(repository.moveStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'CHECKING',
          to: 'IN_STORE',
          kind: 'STATUS',
        }),
      );
      expect(result.status).toBe('IN_STORE');
    });

    it('refuses to send a lift to site with no customer', async () => {
      liftAt('IN_STORE', null);

      await expect(
        service.move(userWith('STORE_KEEPER'), ASSET_ID, { to: 'AT_SITE' }),
      ).rejects.toThrow('Assign a customer before this lift goes to site');
    });

    it('sends a sold lift to site', async () => {
      liftAt('IN_STORE');

      await service.move(userWith('STORE_KEEPER'), ASSET_ID, { to: 'AT_SITE' });

      expect(repository.moveStatus).toHaveBeenCalled();
    });

    it('refuses when someone else moved the lift first', async () => {
      liftAt('ON_ORDER', null);
      repository.moveStatus.mockResolvedValue(false);

      await expect(
        service.move(userWith('STORE_KEEPER'), ASSET_ID, { to: 'CHECKING' }),
      ).rejects.toThrow(WorkflowTransitionError);
    });
  });

  describe('correct', () => {
    it('moves to any status, skips the rules and records the reason', async () => {
      liftAt('ACTIVE', null);

      await service.correct(userWith('GENERAL_MANAGER'), ASSET_ID, {
        to: 'AT_SITE',
        reason: 'Pressed by mistake',
      });

      expect(repository.moveStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'ACTIVE',
          to: 'AT_SITE',
          kind: 'CORRECTED',
          note: 'Pressed by mistake',
        }),
      );
    });

    it('refuses a correction to the status it already has', async () => {
      liftAt('ACTIVE');

      await expect(
        service.correct(userWith('GENERAL_MANAGER'), ASSET_ID, {
          to: 'ACTIVE',
          reason: 'No change',
        }),
      ).rejects.toThrow(WorkflowTransitionError);
    });
  });

  describe('setSoldTo', () => {
    const sale = { customerId: CUSTOMER_ID };

    it('is refused for everyone while maintenance records exist', async () => {
      liftAt('ACTIVE');
      repository.hasMaintenanceRecords.mockResolvedValue(true);

      await expect(
        service.setSoldTo(userWith('GENERAL_MANAGER'), ASSET_ID, sale),
      ).rejects.toThrow(WorkflowTransitionError);
      expect(repository.setSoldTo).not.toHaveBeenCalled();
    });

    it('stops the Sales Manager once the lift has gone to site', async () => {
      liftAt('AT_SITE');

      await expect(
        service.setSoldTo(userWith('SALES_MANAGER'), ASSET_ID, sale),
      ).rejects.toThrow(WorkflowTransitionError);
    });

    it('lets the Sales Manager change it again after a return to store', async () => {
      liftAt('IN_STORE');

      await service.setSoldTo(userWith('SALES_MANAGER'), ASSET_ID, sale);

      expect(repository.setSoldTo).toHaveBeenCalled();
    });

    it('lets the General Manager change it at any status', async () => {
      liftAt('ACTIVE');

      await service.setSoldTo(userWith('GENERAL_MANAGER'), ASSET_ID, sale);

      expect(repository.setSoldTo).toHaveBeenCalled();
    });

    it('refuses an unknown customer', async () => {
      liftAt('IN_STORE', null);
      repository.findCustomer.mockResolvedValue(null);

      await expect(
        service.setSoldTo(userWith('SALES_MANAGER'), ASSET_ID, sale),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a project of another customer', async () => {
      liftAt('IN_STORE', null);
      repository.findProject.mockResolvedValue({
        id: PROJECT_ID,
        customerId: 'someone-else',
      });

      await expect(
        service.setSoldTo(userWith('SALES_MANAGER'), ASSET_ID, {
          customerId: CUSTOMER_ID,
          projectId: PROJECT_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears the project when the customer is cleared', async () => {
      liftAt('IN_STORE');

      await service.setSoldTo(userWith('SALES_MANAGER'), ASSET_ID, {
        customerId: null,
        projectId: PROJECT_ID,
      });

      expect(repository.setSoldTo).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: null, projectId: null }),
      );
      expect(repository.findProject).not.toHaveBeenCalled();
    });
  });

  describe('the checklist', () => {
    it('gives 404 for a row that is not on this lift', async () => {
      liftAt('CHECKING');
      repository.updateItem.mockResolvedValue(null);

      await expect(
        service.updateItem(userWith('STORE_KEEPER'), ASSET_ID, 'row', {
          mark: 'OK',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('gives 404 for a row on a deleted lift', async () => {
      repository.findAsset.mockResolvedValue(null);

      await expect(
        service.updateItem(userWith('STORE_KEEPER'), ASSET_ID, 'row', {
          mark: 'OK',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repository.updateItem).not.toHaveBeenCalled();
    });

    it('ticks or unticks a whole case and reports how many rows', async () => {
      const user = userWith('STORE_KEEPER');
      liftAt('CHECKING');
      repository.markCase.mockResolvedValue(48);

      await expect(
        service.markCase(user, ASSET_ID, 4, { mark: 'MISSING' }),
      ).resolves.toEqual({ marked: 48 });
      expect(repository.markCase).toHaveBeenCalledWith(
        user.tenantId,
        ASSET_ID,
        4,
        'MISSING',
        user.userId,
      );
    });

    it('gives 404 for a case on a deleted lift', async () => {
      repository.findAsset.mockResolvedValue(null);

      await expect(
        service.markCase(userWith('STORE_KEEPER'), ASSET_ID, 4, { mark: 'OK' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
