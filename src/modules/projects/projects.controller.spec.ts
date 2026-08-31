import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import {
  PROJECTS_EXPORT_COLUMNS,
  ProjectsController,
} from './projects.controller';
import type { ProjectsService } from './projects.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('ProjectsController.list — format wiring', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const service = {
    list: jest.fn(),
    streamAll: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new ProjectsController(
    service as unknown as ProjectsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no format: replies with the unchanged JSON page and never touches the exporter', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    service.list.mockResolvedValue(page);

    await controller.list(user, res as never, 'LEAD', undefined, '1', '20', undefined);

    expect(service.list).toHaveBeenCalledWith(user, {
      status: 'LEAD',
      q: undefined,
      page: '1',
      pageSize: '20',
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(service.streamAll).not.toHaveBeenCalled();
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('format=csv: streams from streamAll with the projects export columns', async () => {
    const rows = (async function* () {
      yield { id: 'p1', name: 'Bole Tower' };
    })();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, 'LEAD', undefined, undefined, undefined, 'csv');

    expect(service.streamAll).toHaveBeenCalledWith(user, {
      status: 'LEAD',
      q: undefined,
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^projects-\d{4}-\d{2}-\d{2}$/),
      PROJECTS_EXPORT_COLUMNS,
      rows,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, undefined, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^projects-\d{4}-\d{2}-\d{2}$/),
      PROJECTS_EXPORT_COLUMNS,
      rows,
    );
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('rejects an invalid status before touching the service, same as the JSON path', async () => {
    await expect(
      controller.list(user, res as never, 'BOGUS', undefined, undefined, undefined, undefined),
    ).rejects.toThrow(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.streamAll).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, undefined, undefined, 'pdf'),
    ).rejects.toThrow(/format must be one of/);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.streamAll).not.toHaveBeenCalled();
  });

  it('passes q through to both the JSON list and the export stream', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    service.list.mockResolvedValue(page);

    await controller.list(user, res as never, undefined, 'ሃይሉ', undefined, undefined, undefined);

    expect(service.list).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ q: 'ሃይሉ' }),
    );

    const rows = (async function* () {})();
    service.streamAll.mockReturnValue(rows);
    await controller.list(user, res as never, undefined, 'ሃይሉ', undefined, undefined, 'csv');

    expect(service.streamAll).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ q: 'ሃይሉ' }),
    );
  });
});
