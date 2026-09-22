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
});
