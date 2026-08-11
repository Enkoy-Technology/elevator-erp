import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ExpensesController } from './expenses.controller';
import type { ExpensesService } from './expenses.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('ExpensesController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is FINANCE, and every endpoint relies on it (no method-level override)', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, ExpensesController);
    expect(classRoles).toEqual(['FINANCE']);

    for (const handler of [
      ExpensesController.prototype.record,
      ExpensesController.prototype.list,
      ExpensesController.prototype.get,
      ExpensesController.prototype.reverse,
    ]) {
      expect(reflector.get<string[] | undefined>(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

describe('ExpensesController.list — category/supplyKind/date validation and format routing', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const expensesService = { list: jest.fn(), streamAll: jest.fn() };
  const controller = new ExpensesController(expensesService as unknown as ExpensesService);
  const res = { json: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    expensesService.streamAll.mockImplementation(async function* () {});
  });

  it('rejects an unknown category with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, 'NOT_A_CATEGORY'),
    ).rejects.toThrow(BadRequestException);
    expect(expensesService.list).not.toHaveBeenCalled();
  });

  it('rejects an unknown supplyKind with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, 'BOTH'),
    ).rejects.toThrow(BadRequestException);
    expect(expensesService.list).not.toHaveBeenCalled();
  });

  it('rejects a malformed "from" date with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, undefined, '2026-02-30'),
    ).rejects.toThrow(BadRequestException);
    expect(expensesService.list).not.toHaveBeenCalled();
  });

  it('rejects a malformed "to" date with a 400 before touching the service', async () => {
    await expect(
      controller.list(
        user,
        res as never,
        undefined,
        undefined,
        undefined,
        'not-a-date',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(expensesService.list).not.toHaveBeenCalled();
  });

  it('no ?format=: calls service.list() and writes the paginated JSON result', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    expensesService.list.mockResolvedValue(page);

    await controller.list(
      user,
      res as never,
      'MATERIALS',
      'GOODS',
      '2026-01-01',
      '2026-01-31',
      'Acme',
    );

    expect(expensesService.list).toHaveBeenCalledWith(user, {
      category: 'MATERIALS',
      supplyKind: 'GOODS',
      from: '2026-01-01',
      to: '2026-01-31',
      q: 'Acme',
      page: undefined,
      pageSize: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(expensesService.streamAll).not.toHaveBeenCalled();
  });

  it('?format=csv: streams via writeCsv and never calls the paginated list', async () => {
    await controller.list(
      user,
      res as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'csv',
    );

    expect(expensesService.streamAll).toHaveBeenCalledWith(user, {
      category: undefined,
      supplyKind: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^expenses-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'whtEtb' })]),
      expect.anything(),
    );
    expect(expensesService.list).not.toHaveBeenCalled();
  });

  it('?format=xlsx: streams via writeXlsx', async () => {
    await controller.list(
      user,
      res as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'xlsx',
    );

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^expenses-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'netPayableEtb' })]),
      expect.anything(),
    );
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
        undefined,
        undefined,
        'pdf',
      ),
    ).rejects.toThrow(/format must be one of/);
    expect(expensesService.list).not.toHaveBeenCalled();
  });
});
