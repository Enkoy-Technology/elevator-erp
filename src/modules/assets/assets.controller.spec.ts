import type { AuthenticatedUser } from '../../types/auth.types';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import {
  ASSETS_EXPORT_COLUMNS,
  AssetsController,
} from './assets.controller';
import type { AssetsService } from './assets.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('AssetsController.list — format wiring', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'TECHNICAL_LEAD',
  };

  const service = {
    list: jest.fn(),
    streamAll: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new AssetsController(
    service as unknown as AssetsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no format: replies with the unchanged JSON page and never touches the exporter', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    service.list.mockResolvedValue(page);

    await controller.list(
      user,
      res as never,
      'lift',
      'ELEVATOR',
      undefined,
      '1',
      '20',
      undefined,
    );

    expect(service.list).toHaveBeenCalledWith(user, {
      search: 'lift',
      category: 'ELEVATOR',
      customerId: undefined,
      page: '1',
      pageSize: '20',
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(service.streamAll).not.toHaveBeenCalled();
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('format=csv: streams from streamAll with the assets export columns', async () => {
    const rows = (async function* () {
      yield { id: 'a1', name: 'Lift 1' };
    })();
    service.streamAll.mockReturnValue(rows);

    await controller.list(
      user,
      res as never,
      'lift',
      'ELEVATOR',
      undefined,
      undefined,
      undefined,
      'csv',
    );

    expect(service.streamAll).toHaveBeenCalledWith(user, {
      search: 'lift',
      category: 'ELEVATOR',
      customerId: undefined,
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^assets-\d{4}-\d{2}-\d{2}$/),
      ASSETS_EXPORT_COLUMNS,
      rows,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAll.mockReturnValue(rows);

    await controller.list(
      user,
      res as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'xlsx',
    );

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^assets-\d{4}-\d{2}-\d{2}$/),
      ASSETS_EXPORT_COLUMNS,
      rows,
    );
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.list(
        user,
        res as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'pdf',
      ),
    ).rejects.toThrow(/format must be one of/);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.streamAll).not.toHaveBeenCalled();
  });
});
