import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { OutboxController } from './outbox.controller';
import type { OutboxService } from './outbox.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('OutboxController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is ADMIN, and no route needs a method-level override (CEO/ADMIN reach it via RolesGuard.SUPER_ROLES)', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, OutboxController);
    expect(classRoles).toEqual(['ADMIN']);

    for (const handler of [
      OutboxController.prototype.getProvider,
      OutboxController.prototype.list,
      OutboxController.prototype.retry,
    ]) {
      expect(reflector.get<string[] | undefined>(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

describe('OutboxController.list — filter validation and format routing', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'ADMIN',
  };

  const outboxService = {
    list: jest.fn(),
    streamAll: jest.fn(),
    retry: jest.fn(),
    getSmsProviderName: jest.fn(),
  };
  const controller = new OutboxController(outboxService as unknown as OutboxService);
  const res = { json: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    outboxService.streamAll.mockImplementation(async function* () {});
  });

  it('rejects an unknown status with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, 'NOT_A_STATUS'),
    ).rejects.toThrow(BadRequestException);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  it('rejects an unknown channel with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, 'FAX'),
    ).rejects.toThrow(BadRequestException);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  it('rejects a malformed "from" date with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, '08/12/2026'),
    ).rejects.toThrow(BadRequestException);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  it('rejects a malformed "to" date with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, undefined, 'not-a-date'),
    ).rejects.toThrow(BadRequestException);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  // Nit fix: the regex alone lets a calendar-invalid date (month 13, day 45)
  // through, which would previously 500 instead of 400ing — same round-trip
  // check as payments.controller.ts's own parseOptionalCalendarDate.
  it('rejects a calendar-invalid "from" date (2026-13-45) with a 400, not a 500', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, '2026-13-45'),
    ).rejects.toThrow(BadRequestException);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  it('with no ?format, calls the service and writes the paginated result as JSON', async () => {
    const result = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    outboxService.list.mockResolvedValue(result);

    await controller.list(user, res as never, 'FAILED', 'SMS', '2026-08-01', '2026-08-12');

    expect(outboxService.list).toHaveBeenCalledWith(
      user,
      { status: 'FAILED', channel: 'SMS', from: '2026-08-01', to: '2026-08-12' },
      undefined,
      undefined,
    );
    expect(res.json).toHaveBeenCalledWith(result);
    expect(outboxService.streamAll).not.toHaveBeenCalled();
  });

  it('?format=csv streams via writeCsv instead of calling list', async () => {
    await controller.list(user, res as never, undefined, undefined, undefined, undefined, undefined, undefined, 'csv');

    expect(outboxService.list).not.toHaveBeenCalled();
    expect(outboxService.streamAll).toHaveBeenCalledWith(user, {
      status: undefined,
      channel: undefined,
      from: undefined,
      to: undefined,
    });
    expect(mockWriteCsv).toHaveBeenCalledTimes(1);
    expect(mockWriteXlsx).not.toHaveBeenCalled();
  });

  it('?format=xlsx streams via writeXlsx instead of calling list', async () => {
    await controller.list(user, res as never, undefined, undefined, undefined, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledTimes(1);
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });
});

describe('OutboxController.getProvider', () => {
  it('reports the configured SmsProvider name', () => {
    const outboxService = { getSmsProviderName: jest.fn(() => 'geezsms') };
    const controller = new OutboxController(outboxService as unknown as OutboxService);

    expect(controller.getProvider()).toEqual({ provider: 'geezsms' });
  });
});

describe('OutboxController.retry', () => {
  it('delegates to the service with the current user and message id', () => {
    const user: AuthenticatedUser = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'ADMIN',
    };
    const outboxService = { retry: jest.fn(async () => ({ id: 'm1', status: 'QUEUED' })) };
    const controller = new OutboxController(outboxService as unknown as OutboxService);

    void controller.retry(user, 'm1');

    expect(outboxService.retry).toHaveBeenCalledWith(user, 'm1');
  });
});
