import { NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { CustomerRecord } from './customers.repository';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'CEO',
    permissions: [],
  };

  const sample: CustomerRecord = {
    tenantId: user.tenantId,
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Addis Heights PLC',
    legalName: null,
    email: 'ops@addisheights.et',
    phone: '+251911000000',
    alternatePhone: null,
    addressLine1: null,
    addressLine2: null,
    city: 'Addis Ababa',
    region: null,
    country: 'ET',
    buildingName: null,
    latitude: null,
    longitude: null,
    customerType: 'COMMERCIAL',
    creditLimitEtb: '0',
    outstandingBalanceEtb: '0',
    paymentTermsDays: '30',
    tags: null,
    notes: null,
    createdByUserId: user.userId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const service = new CustomersService(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists customers for the tenant', async () => {
    const page = {
      items: [sample],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    repo.list.mockResolvedValue(page);
    await expect(
      service.list(user, { search: 'addis' }),
    ).resolves.toEqual(page);
    expect(repo.list).toHaveBeenCalledWith(user.tenantId, {
      search: 'addis',
    });
  });

  it('returns a customer by id', async () => {
    repo.findById.mockResolvedValue(sample);
    await expect(service.getById(user, sample.id)).resolves.toEqual(sample);
  });

  it('throws NotFoundException when customer is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getById(user, sample.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a customer', async () => {
    const dto = { name: 'Addis Heights PLC' };
    repo.create.mockResolvedValue(sample);
    await expect(service.create(user, dto)).resolves.toEqual(sample);
    expect(repo.create).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      dto,
    );
  });
});
