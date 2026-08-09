import type { AuthenticatedUser } from '../../types/auth.types';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import {
  EMPLOYEES_EXPORT_COLUMNS,
  EmployeesController,
} from './employees.controller';
import type { EmployeesService } from './employees.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('EmployeesController.list — format wiring', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'ADMIN',
  };

  const service = {
    list: jest.fn(),
    streamAll: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new EmployeesController(
    service as unknown as EmployeesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no format: replies with the unchanged JSON page and never touches the exporter', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    service.list.mockResolvedValue(page);

    await controller.list(user, res as never, '1', '20', 'kebede', undefined);

    expect(service.list).toHaveBeenCalledWith(user, {
      page: '1',
      pageSize: '20',
      q: 'kebede',
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(service.streamAll).not.toHaveBeenCalled();
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('format=csv: streams from streamAll with the employees export columns, which carry no credential fields', async () => {
    const rows = (async function* () {
      yield {
        id: 'u1',
        email: 'kebede@example.et',
        fullName: 'Kebede Alemu',
        phone: null,
        role: 'DISPATCHER',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    })();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, undefined, undefined, undefined, 'csv');

    expect(service.streamAll).toHaveBeenCalledWith(user, { q: undefined });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^employees-\d{4}-\d{2}-\d{2}$/),
      EMPLOYEES_EXPORT_COLUMNS,
      rows,
    );
    expect(service.list).not.toHaveBeenCalled();
    const columnKeys = EMPLOYEES_EXPORT_COLUMNS.map((col) => col.key);
    expect(columnKeys).not.toContain('passwordHash');
    expect(columnKeys).not.toContain('refreshTokenHash');
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^employees-\d{4}-\d{2}-\d{2}$/),
      EMPLOYEES_EXPORT_COLUMNS,
      rows,
    );
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, undefined, 'pdf'),
    ).rejects.toThrow(/format must be one of/);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.streamAll).not.toHaveBeenCalled();
  });
});
