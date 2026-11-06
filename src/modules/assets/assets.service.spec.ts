import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { ARRIVAL_CHECKLIST } from './arrival-checklist';
import type { AssetsRepository } from './assets.repository';
import { AssetsService } from './assets.service';

const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';

describe('AssetsService.create', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'STORE_KEEPER',
  };
  const technicalManager: AuthenticatedUser = {
    ...user,
    role: 'TECHNICAL_MANAGER',
  };
  const repository = { create: jest.fn() };
  const service = new AssetsService(repository as unknown as AssetsRepository);
  const lift = { category: 'ELEVATOR', name: 'Lift A' } as const;

  beforeEach(() => jest.clearAllMocks());

  it('starts a lift from the factory on order, in stock, with every part ticked as arrived', async () => {
    await service.create(user, { ...lift, startingPoint: 'FROM_FACTORY' });

    expect(repository.create).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      expect.objectContaining({ startingPoint: 'FROM_FACTORY' }),
      {
        status: 'ON_ORDER',
        checklist: ARRIVAL_CHECKLIST.map((row) => ({ ...row, mark: 'OK' })),
      },
    );
  });

  it('leaves unticked only the parts named as not arrived', async () => {
    await service.create(user, {
      ...lift,
      startingPoint: 'FROM_FACTORY',
      missingParts: ['1/2', '5/F3'],
    });

    const { checklist } = repository.create.mock.calls[0]?.[3] as {
      checklist: { caseNo: number; itemNo: string; mark: string }[];
    };
    expect(checklist).toHaveLength(134);
    expect(
      checklist
        .filter((row) => row.mark === 'MISSING')
        .map((row) => `${row.caseNo}/${row.itemNo}`),
    ).toEqual(['1/2', '5/F3']);
  });

  it('refuses a customer on a lift from the factory: Sales records the sale', async () => {
    await expect(
      service.create(user, {
        ...lift,
        startingPoint: 'FROM_FACTORY',
        customerId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('gives no checklist when the packing list is unticked, as for a car lift', async () => {
    await service.create(user, {
      ...lift,
      startingPoint: 'FROM_FACTORY',
      usePackingList: false,
    });

    expect(repository.create.mock.calls[0]?.[3]).toEqual({
      status: 'ON_ORDER',
      checklist: [],
    });
  });

  it('gives no checklist to an escalator, which the packing list does not describe', async () => {
    await service.create(user, {
      category: 'ESCALATOR',
      name: 'Escalator 1',
      startingPoint: 'FROM_FACTORY',
    });

    expect(repository.create.mock.calls[0]?.[3]).toEqual({
      status: 'ON_ORDER',
      checklist: [],
    });
  });

  it('puts an installed lift straight in service, with no checklist', async () => {
    await service.create(technicalManager, {
      ...lift,
      startingPoint: 'INSTALLED',
      customerId: CUSTOMER_ID,
    });

    expect(repository.create.mock.calls[0]?.[3]).toEqual({
      status: 'ACTIVE',
      checklist: [],
    });
  });

  it('treats a request with no starting point as an installed lift, as before', async () => {
    await service.create(technicalManager, { ...lift, customerId: CUSTOMER_ID });

    expect(repository.create.mock.calls[0]?.[3]).toEqual({
      status: 'ACTIVE',
      checklist: [],
    });
  });

  it('refuses an installed lift from a Store Keeper, who cannot read customers', async () => {
    await expect(
      service.create(user, {
        ...lift,
        startingPoint: 'INSTALLED',
        customerId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create(user, { ...lift, customerId: CUSTOMER_ID }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('requires a customer on an installed lift', async () => {
    await expect(service.create(technicalManager, lift)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});
