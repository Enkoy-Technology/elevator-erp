import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { MaintenanceController } from './maintenance.controller';
import type { MaintenanceService } from './maintenance.service';

describe('MaintenanceController.listContracts — status validation', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'DISPATCHER',
  };

  const service = {
    listContracts: jest.fn(),
  };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid status with a 400, the same error type the breakdown path uses', () => {
    expect(() => controller.listContracts(user, undefined, undefined, 'BOGUS')).toThrow(
      BadRequestException,
    );
    expect(service.listContracts).not.toHaveBeenCalled();
  });

  it('passes a valid status through to the service', () => {
    service.listContracts.mockReturnValue('ok');
    const result = controller.listContracts(user, '1', '20', 'ACTIVE');
    expect(result).toBe('ok');
    expect(service.listContracts).toHaveBeenCalledWith(user, {
      page: '1',
      pageSize: '20',
      status: 'ACTIVE',
    });
  });

  it('leaves the filter off entirely when no status is given', () => {
    service.listContracts.mockReturnValue('ok');
    void controller.listContracts(user, undefined, undefined, undefined);
    expect(service.listContracts).toHaveBeenCalledWith(user, {
      page: undefined,
      pageSize: undefined,
      status: undefined,
    });
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
  };

  const controller = new MaintenanceController(
    service as unknown as MaintenanceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid status with a 400 instead of silently dropping the filter', () => {
    expect(() => controller.listBreakdowns(user, undefined, undefined, 'BOGUS')).toThrow(
      BadRequestException,
    );
    expect(service.listBreakdowns).not.toHaveBeenCalled();
  });

  it('passes a valid status through to the service', () => {
    service.listBreakdowns.mockReturnValue('ok');
    const result = controller.listBreakdowns(user, '1', '20', 'OPEN');
    expect(result).toBe('ok');
    expect(service.listBreakdowns).toHaveBeenCalledWith(user, {
      page: '1',
      pageSize: '20',
      status: 'OPEN',
    });
  });

  it('leaves the filter off entirely when no status is given', () => {
    service.listBreakdowns.mockReturnValue('ok');
    void controller.listBreakdowns(user, undefined, undefined, undefined);
    expect(service.listBreakdowns).toHaveBeenCalledWith(user, {
      page: undefined,
      pageSize: undefined,
      status: undefined,
    });
  });
});
