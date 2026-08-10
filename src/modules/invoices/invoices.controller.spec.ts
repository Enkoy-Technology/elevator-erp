import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import { writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { InvoicesController } from './invoices.controller';
import type { InvoicesService } from './invoices.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);

describe('InvoicesController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is FINANCE, and mutation endpoints do not need a method-level override', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, InvoicesController);
    expect(classRoles).toEqual(['FINANCE']);

    for (const handler of [
      InvoicesController.prototype.convertToInvoice,
      InvoicesController.prototype.create,
      InvoicesController.prototype.list,
      InvoicesController.prototype.get,
      InvoicesController.prototype.voidInvoice,
      InvoicesController.prototype.patchFiscal,
    ]) {
      expect(reflector.get<string[] | undefined>(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

describe('InvoicesController.list — status validation and format routing', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const invoicesService = {
    list: jest.fn(),
    streamAll: jest.fn(),
  };
  const controller = new InvoicesController(invoicesService as unknown as InvoicesService);
  const res = { json: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
     
    invoicesService.streamAll.mockImplementation(async function* () {});
  });

  it('rejects an unknown status with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, 'NOT_A_STATUS'),
    ).rejects.toThrow(BadRequestException);
    expect(invoicesService.list).not.toHaveBeenCalled();
  });

  it('no ?format=: calls service.list() and writes the paginated JSON result', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    invoicesService.list.mockResolvedValue(page);

    await controller.list(user, res as never, undefined, 'cust-1', 'INV-1');

    expect(invoicesService.list).toHaveBeenCalledWith(user, {
      status: undefined,
      customerId: 'cust-1',
      q: 'INV-1',
      page: undefined,
      pageSize: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(invoicesService.streamAll).not.toHaveBeenCalled();
  });

  it('?format=csv: streams via writeCsv and never calls the paginated list', async () => {
    await controller.list(user, res as never, 'ISSUED', undefined, undefined, undefined, undefined, 'csv');

    expect(invoicesService.streamAll).toHaveBeenCalledWith(user, {
      status: 'ISSUED',
      customerId: undefined,
      q: undefined,
    });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^invoices-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'fiscalReceiptNumber' })]),
      expect.anything(),
    );
    expect(invoicesService.list).not.toHaveBeenCalled();
  });

  it('?format=xlsx: streams via writeXlsx', async () => {
    await controller.list(user, res as never, undefined, undefined, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^invoices-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'customerName' })]),
      expect.anything(),
    );
  });
});
