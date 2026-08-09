import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import {
  BREAKDOWNS_EXPORT_COLUMNS,
  MAINTENANCE_CONTRACTS_EXPORT_COLUMNS,
  MaintenanceController,
} from './maintenance.controller';
import type { MaintenanceService } from './maintenance.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('MaintenanceController.listContracts — status validation', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'DISPATCHER',
  };

  const service = {
    listContracts: jest.fn(),
    streamAllContracts: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid status with a 400, the same error type the breakdown path uses', async () => {
    await expect(
      controller.listContracts(user, res as never, undefined, undefined, 'BOGUS', undefined),
    ).rejects.toThrow(BadRequestException);
    expect(service.listContracts).not.toHaveBeenCalled();
  });

  it('passes a valid status through to the service and replies with the JSON page', async () => {
    const page = 'ok';
    service.listContracts.mockResolvedValue(page);
    await controller.listContracts(user, res as never, '1', '20', 'ACTIVE', undefined);
    expect(service.listContracts).toHaveBeenCalledWith(user, {
      page: '1',
      pageSize: '20',
      status: 'ACTIVE',
    });
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it('leaves the filter off entirely when no status is given', async () => {
    service.listContracts.mockResolvedValue('ok');
    await controller.listContracts(user, res as never, undefined, undefined, undefined, undefined);
    expect(service.listContracts).toHaveBeenCalledWith(user, {
      page: undefined,
      pageSize: undefined,
      status: undefined,
    });
  });
});

describe('MaintenanceController.listContracts — format wiring', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'DISPATCHER',
  };

  const service = {
    listContracts: jest.fn(),
    streamAllContracts: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('format=csv: streams from streamAllContracts with the contracts export columns', async () => {
    const rows = (async function* () {
      yield { id: 'c1', status: 'ACTIVE' };
    })();
    service.streamAllContracts.mockReturnValue(rows);

    await controller.listContracts(user, res as never, undefined, undefined, 'ACTIVE', 'csv');

    expect(service.streamAllContracts).toHaveBeenCalledWith(user, {
      status: 'ACTIVE',
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^maintenance-contracts-\d{4}-\d{2}-\d{2}$/),
      MAINTENANCE_CONTRACTS_EXPORT_COLUMNS,
      rows,
    );
    expect(service.listContracts).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAllContracts.mockReturnValue(rows);

    await controller.listContracts(user, res as never, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^maintenance-contracts-\d{4}-\d{2}-\d{2}$/),
      MAINTENANCE_CONTRACTS_EXPORT_COLUMNS,
      rows,
    );
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.listContracts(user, res as never, undefined, undefined, undefined, 'pdf'),
    ).rejects.toThrow(/format must be one of/);
    expect(service.listContracts).not.toHaveBeenCalled();
    expect(service.streamAllContracts).not.toHaveBeenCalled();
  });
});

describe('MaintenanceController.listBreakdowns — status validation', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'DISPATCHER',
  };

  const service = {
    listBreakdowns: jest.fn(),
    streamAllBreakdowns: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid status with a 400 instead of silently dropping the filter', async () => {
    await expect(
      controller.listBreakdowns(user, res as never, undefined, undefined, 'BOGUS', undefined),
    ).rejects.toThrow(BadRequestException);
    expect(service.listBreakdowns).not.toHaveBeenCalled();
  });

  it('passes a valid status through to the service and replies with the JSON page', async () => {
    const page = 'ok';
    service.listBreakdowns.mockResolvedValue(page);
    await controller.listBreakdowns(user, res as never, '1', '20', 'OPEN', undefined);
    expect(service.listBreakdowns).toHaveBeenCalledWith(user, {
      page: '1',
      pageSize: '20',
      status: 'OPEN',
    });
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it('leaves the filter off entirely when no status is given', async () => {
    service.listBreakdowns.mockResolvedValue('ok');
    await controller.listBreakdowns(user, res as never, undefined, undefined, undefined, undefined);
    expect(service.listBreakdowns).toHaveBeenCalledWith(user, {
      page: undefined,
      pageSize: undefined,
      status: undefined,
    });
  });
});

describe('MaintenanceController.listBreakdowns — format wiring', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'DISPATCHER',
  };

  const service = {
    listBreakdowns: jest.fn(),
    streamAllBreakdowns: jest.fn(),
  };

  const res = { json: jest.fn() };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('format=csv: streams from streamAllBreakdowns with the breakdowns export columns', async () => {
    const rows = (async function* () {
      yield { id: 'b1', status: 'OPEN' };
    })();
    service.streamAllBreakdowns.mockReturnValue(rows);

    await controller.listBreakdowns(user, res as never, undefined, undefined, 'OPEN', 'csv');

    expect(service.streamAllBreakdowns).toHaveBeenCalledWith(user, {
      status: 'OPEN',
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^maintenance-breakdowns-\d{4}-\d{2}-\d{2}$/),
      BREAKDOWNS_EXPORT_COLUMNS,
      rows,
    );
    expect(service.listBreakdowns).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAllBreakdowns.mockReturnValue(rows);

    await controller.listBreakdowns(user, res as never, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^maintenance-breakdowns-\d{4}-\d{2}-\d{2}$/),
      BREAKDOWNS_EXPORT_COLUMNS,
      rows,
    );
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.listBreakdowns(user, res as never, undefined, undefined, undefined, 'pdf'),
    ).rejects.toThrow(/format must be one of/);
    expect(service.listBreakdowns).not.toHaveBeenCalled();
    expect(service.streamAllBreakdowns).not.toHaveBeenCalled();
  });
});
