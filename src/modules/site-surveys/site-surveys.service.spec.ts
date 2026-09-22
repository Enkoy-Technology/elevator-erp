import { NotFoundException } from '@nestjs/common';

import type {
  SiteSurveyRecord,
  SiteSurveysRepository,
} from './site-surveys.repository';
import type { NotificationsRepository } from '../notifications/notifications.repository';
import { SiteSurveysService } from './site-surveys.service';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';

const survey = (over: Partial<SiteSurveyRecord> = {}): SiteSurveyRecord => ({
  tenantId: TENANT_ID,
  id: '33333333-3333-3333-3333-333333333333',
  surveyedByUserId: USER_ID,
  collectedByName: null,
  surveyDate: '2026-09-22',
  projectName: 'Bole Plaza',
  address: null,
  contactName: null,
  contactPhone: null,
  shaftWidthCm: 200,
  shaftDepthCm: 180,
  floors: 'B+G+11',
  overheadCm: null,
  machineRoom: 'With MR',
  units: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('SiteSurveysService', () => {
  const surveys = {
    list: jest.fn(),
    create: jest.fn(),
    listManagerIds: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const notifications = { create: jest.fn() };
  const service = new SiteSurveysService(
    surveys as unknown as SiteSurveysRepository,
    notifications as unknown as NotificationsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    surveys.create.mockResolvedValue(survey());
    surveys.listManagerIds.mockResolvedValue(['gm-1', 'sm-2']);
    notifications.create.mockResolvedValue({});
  });

  it('tells every manager a sheet came in, with the sheet in one line', async () => {
    await service.create(
      { userId: USER_ID, tenantId: TENANT_ID, role: 'SALESPERSON' as const },
      { projectName: 'Belachew' },
    );

    expect(notifications.create).toHaveBeenCalledTimes(2);
    const [, , dto] = notifications.create.mock.calls[0] as [
      string,
      string,
      { title: string; body: string; linkPath: string },
    ];
    expect(dto.title).toBe('New site survey: Bole Plaza');
    expect(dto.linkPath).toBe('/surveys');
    expect(dto.body).toContain('Shaft 200 x 180 cm');
  });

  it('keeps the sheet when the managers cannot be told', async () => {
    surveys.listManagerIds.mockRejectedValue(new Error('database is away'));

    await expect(
      service.create(
        { userId: USER_ID, tenantId: TENANT_ID, role: 'SALESPERSON' as const },
        { projectName: 'Belachew' },
      ),
    ).resolves.toMatchObject({ projectName: 'Bole Plaza' });
  });

  it('scopes a salesperson to their own sheets', async () => {
    await service.list(
      { userId: USER_ID, tenantId: TENANT_ID, role: 'SALESPERSON' },
      { page: '2' },
    );
    expect(surveys.list).toHaveBeenCalledWith(TENANT_ID, {
      surveyedByUserId: USER_ID,
      search: undefined,
      page: '2',
      pageSize: undefined,
    });
  });

  it.each(['SALES_MANAGER', 'GENERAL_MANAGER', 'SECRETARY'] as const)(
    'lets %s see every sheet',
    async (role) => {
      await service.list({ userId: USER_ID, tenantId: TENANT_ID, role }, {});
      expect(surveys.list).toHaveBeenCalledWith(TENANT_ID, {
        surveyedByUserId: undefined,
        search: undefined,
        page: undefined,
        pageSize: undefined,
      });
    },
  );

  it('stamps the collector from the token, not the body', async () => {
    const created = await service.create(
      { userId: USER_ID, tenantId: TENANT_ID, role: 'SALESPERSON' },
      { projectName: 'Bole Plaza' },
    );
    expect(surveys.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
      projectName: 'Bole Plaza',
    });
    expect(created.projectName).toBe('Bole Plaza');
  });

  it('passes the search term through to the repository', async () => {
    await service.list(
      { userId: USER_ID, tenantId: TENANT_ID, role: 'SALES_MANAGER' },
      { search: 'bole' },
    );
    expect(surveys.list).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ search: 'bole' }),
    );
  });

  it('scopes a salesperson when they read, edit or delete one sheet', async () => {
    const salesperson = {
      userId: USER_ID,
      tenantId: TENANT_ID,
      role: 'SALESPERSON' as const,
    };
    surveys.findById.mockResolvedValue({
      ...survey(),
      surveyedByName: 'Abebe',
    });

    await service.getById(salesperson, 'survey-1');
    await service.update(salesperson, 'survey-1', { floors: 'B+G+12' });
    await service.delete(salesperson, 'survey-1');

    expect(surveys.findById).toHaveBeenCalledWith(
      TENANT_ID,
      'survey-1',
      USER_ID,
    );
    expect(surveys.update).toHaveBeenCalledWith(
      TENANT_ID,
      'survey-1',
      { floors: 'B+G+12' },
      USER_ID,
    );
    expect(surveys.delete).toHaveBeenCalledWith(TENANT_ID, 'survey-1', USER_ID);
  });

  it("is a 404, not a 403, when a salesperson asks for another's sheet", async () => {
    surveys.findById.mockResolvedValue(null);

    await expect(
      service.getById(
        { userId: USER_ID, tenantId: TENANT_ID, role: 'SALESPERSON' },
        'someone-elses',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['SALES_MANAGER', 'GENERAL_MANAGER', 'SECRETARY'] as const)(
    'lets %s edit and delete any sheet',
    async (role) => {
      const manager = { userId: USER_ID, tenantId: TENANT_ID, role };

      await service.update(manager, 'survey-1', { units: 2 });
      await service.delete(manager, 'survey-1');

      expect(surveys.update).toHaveBeenCalledWith(
        TENANT_ID,
        'survey-1',
        { units: 2 },
        undefined,
      );
      expect(surveys.delete).toHaveBeenCalledWith(
        TENANT_ID,
        'survey-1',
        undefined,
      );
    },
  );
});
