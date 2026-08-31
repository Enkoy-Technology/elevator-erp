import { NotFoundException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { ProjectRecord } from './projects.repository';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'CEO',
  };

  const sample: ProjectRecord = {
    tenantId: user.tenantId,
    id: '44444444-4444-4444-4444-444444444444',
    customerId: '55555555-5555-5555-5555-555555555555',
    name: 'Bole Twin Towers — Lift A',
    nameNormalized: 'bole twin towers — lift a',
    code: 'PRJ-001',
    status: 'LEAD',
    siteAddressLine1: null,
    siteAddressLine2: null,
    siteCity: 'Addis Ababa',
    siteRegion: null,
    siteCountry: 'ET',
    siteLatitude: null,
    siteLongitude: null,
    buildingName: null,
    quotedAmountEtb: null,
    contractAmountEtb: null,
    salesRepUserId: null,
    technicalLeadUserId: null,
    projectManagerUserId: null,
    expectedStartDate: null,
    expectedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    wonAt: null,
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
    updateStatus: jest.fn(),
    hasIssuedProforma: jest.fn(),
  };

  const service = new ProjectsService(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
    // Only exercised by the PROFORMA-bound tests below; harmless default for
    // every other transition target.
    repo.hasIssuedProforma.mockResolvedValue(true);
  });

  it('creates a project at LEAD', async () => {
    const dto = {
      customerId: sample.customerId,
      name: sample.name,
    };
    repo.create.mockResolvedValue(sample);
    await expect(service.create(user, dto)).resolves.toEqual(sample);
    expect(repo.create).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      dto,
    );
  });

  it('allows LEAD -> SITE_SURVEY', async () => {
    repo.findById.mockResolvedValue(sample);
    repo.updateStatus.mockResolvedValue({
      ...sample,
      status: 'SITE_SURVEY',
    });
    await expect(
      service.updateStatus(user, sample.id, 'SITE_SURVEY'),
    ).resolves.toMatchObject({ status: 'SITE_SURVEY' });
  });

  it('rejects illegal LEAD -> CONTRACT with WorkflowTransitionError', async () => {
    repo.findById.mockResolvedValue(sample);
    await expect(
      service.updateStatus(user, sample.id, 'CONTRACT'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('advances QUOTATION -> PROFORMA once an issued proforma exists for the project', async () => {
    repo.findById.mockResolvedValue({ ...sample, status: 'QUOTATION' });
    repo.hasIssuedProforma.mockResolvedValue(true);
    repo.updateStatus.mockResolvedValue({ ...sample, status: 'PROFORMA' });
    await expect(
      service.updateStatus(user, sample.id, 'PROFORMA'),
    ).resolves.toMatchObject({ status: 'PROFORMA' });
    expect(repo.hasIssuedProforma).toHaveBeenCalledWith(
      user.tenantId,
      sample.id,
    );
    expect(repo.updateStatus).toHaveBeenCalledWith(
      user.tenantId,
      sample.id,
      'QUOTATION',
      'PROFORMA',
      {},
    );
  });

  it('blocks QUOTATION -> PROFORMA when no issued proforma exists for the project (DAG gate)', async () => {
    repo.findById.mockResolvedValue({ ...sample, status: 'QUOTATION' });
    repo.hasIssuedProforma.mockResolvedValue(false);
    await expect(
      service.updateStatus(user, sample.id, 'PROFORMA'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('records the deal value alongside the status change', async () => {
    repo.findById.mockResolvedValue({ ...sample, status: 'PROFORMA' });
    repo.updateStatus.mockResolvedValue({ ...sample, status: 'CONTRACT' });
    await expect(
      service.updateStatus(user, sample.id, 'CONTRACT', {
        contractAmountEtb: '165000.00',
      }),
    ).resolves.toMatchObject({ status: 'CONTRACT' });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      user.tenantId,
      sample.id,
      'PROFORMA',
      'CONTRACT',
      { contractAmountEtb: '165000.00' },
    );
  });

  it('throws NotFoundException when project is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getById(user, sample.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
