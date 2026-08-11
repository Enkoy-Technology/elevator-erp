import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import {
  arrayToAsyncIterable,
  setDownloadHeaders,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import {
  CUSTOMERS_EXPORT_COLUMNS,
  CustomersController,
  STATEMENT_EXPORT_COLUMNS,
} from './customers.controller';
import type { CustomersService } from './customers.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);
const mockSetDownloadHeaders = jest.mocked(setDownloadHeaders);
const mockArrayToAsyncIterable = jest.mocked(arrayToAsyncIterable);
// Auto-mocked like writeCsv/writeXlsx above — give it a real (if trivial)
// AsyncGenerator back so `expect.anything()` on the 4th writeCsv/writeXlsx
// arg has something other than `undefined` to match.
mockArrayToAsyncIterable.mockImplementation(
   
  async function* () {},
);

describe('CustomersController.list — format wiring', () => {
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
  const pdfService = { renderDocumentPdf: jest.fn() };
  const tenantBranding = { get: jest.fn() };

  const controller = new CustomersController(
    service as unknown as CustomersService,
    pdfService as never,
    tenantBranding as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no format: replies with the unchanged JSON page and never touches the exporter', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    service.list.mockResolvedValue(page);

    await controller.list(user, res as never, 'addis', '1', '20', undefined);

    expect(service.list).toHaveBeenCalledWith(user, {
      search: 'addis',
      page: '1',
      pageSize: '20',
    });
    expect(res.json).toHaveBeenCalledWith(page);
    expect(service.streamAll).not.toHaveBeenCalled();
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('format=csv: streams from streamAll with the customers export columns', async () => {
    const rows = (async function* () {
      yield { id: 'c1', name: 'Addis Heights' };
    })();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, 'addis', undefined, undefined, 'csv');

    expect(service.streamAll).toHaveBeenCalledWith(user, { search: 'addis' });
    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^customers-\d{4}-\d{2}-\d{2}$/),
      CUSTOMERS_EXPORT_COLUMNS,
      rows,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('format=xlsx: streams via writeXlsx instead of writeCsv', async () => {
    const rows = (async function* () {})();
    service.streamAll.mockReturnValue(rows);

    await controller.list(user, res as never, undefined, undefined, undefined, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^customers-\d{4}-\d{2}-\d{2}$/),
      CUSTOMERS_EXPORT_COLUMNS,
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

describe('CustomersController.statement — date validation and format routing', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };
  const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';

  const service = { statement: jest.fn() };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };
  const controller = new CustomersController(
    service as unknown as CustomersService,
    pdfService as never,
    tenantBranding as never,
  );
  const res = { json: jest.fn(), end: jest.fn() };
  const statementResult = {
    customerId: CUSTOMER_ID,
    customerName: 'Acme',
    openingBalance: '0.00',
    closingBalance: '60.00',
    rows: [
      {
        id: 'inv-1',
        kind: 'invoice',
        date: '2026-08-08',
        reference: 'INV-1',
        debit: '100.00',
        credit: '0.00',
        balance: '100.00',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service.statement.mockResolvedValue(statementResult);
    tenantBranding.get.mockResolvedValue(branding);
  });

  it('missing from/to: 400s before touching the service', async () => {
    await expect(
      controller.statement(user, res as never, CUSTOMER_ID, undefined, undefined, undefined),
    ).rejects.toThrow(BadRequestException);
    expect(service.statement).not.toHaveBeenCalled();
  });

  it('an unparseable date shape: 400s', async () => {
    await expect(
      controller.statement(user, res as never, CUSTOMER_ID, '08/08/2026', '2026-08-31', undefined),
    ).rejects.toThrow(/must be an ISO date/);
  });

  it('a real-looking but invalid calendar date (Feb 30) is rejected, not silently rolled forward', async () => {
    await expect(
      controller.statement(user, res as never, CUSTOMER_ID, '2026-02-30', '2026-03-01', undefined),
    ).rejects.toThrow(/not a valid calendar date/);
    expect(service.statement).not.toHaveBeenCalled();
  });

  it('from after to: 400s', async () => {
    await expect(
      controller.statement(user, res as never, CUSTOMER_ID, '2026-08-31', '2026-08-01', undefined),
    ).rejects.toThrow(/from must not be after to/);
    expect(service.statement).not.toHaveBeenCalled();
  });

  it('no ?format=: replies with the raw JSON statement', async () => {
    await controller.statement(user, res as never, CUSTOMER_ID, '2026-08-01', '2026-08-31', undefined);

    expect(service.statement).toHaveBeenCalledWith(user, CUSTOMER_ID, '2026-08-01', '2026-08-31');
    expect(res.json).toHaveBeenCalledWith(statementResult);
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('?format=csv: streams the statement rows via writeCsv', async () => {
    await controller.statement(user, res as never, CUSTOMER_ID, '2026-08-01', '2026-08-31', 'csv');

    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^statement-.+-2026-08-01-to-2026-08-31$/),
      STATEMENT_EXPORT_COLUMNS,
      expect.anything(),
    );
    expect(res.json).not.toHaveBeenCalled();
  });

  it('?format=xlsx: streams via writeXlsx', async () => {
    await controller.statement(user, res as never, CUSTOMER_ID, '2026-08-01', '2026-08-31', 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^statement-/),
      STATEMENT_EXPORT_COLUMNS,
      expect.anything(),
    );
  });

  it('?format=pdf: renders via DocumentPdfService and writes statement-<...>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));

    await controller.statement(user, res as never, CUSTOMER_ID, '2026-08-01', '2026-08-31', 'pdf');

    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'customer-statement',
      expect.objectContaining({
        customerName: 'Acme',
        from: '2026-08-01',
        to: '2026-08-31',
        closingBalance: '60.00',
      }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^statement-.+-2026-08-01-to-2026-08-31$/),
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.statement(user, res as never, CUSTOMER_ID, '2026-08-01', '2026-08-31', 'docx'),
    ).rejects.toThrow(/format must be one of/);
    expect(service.statement).not.toHaveBeenCalled();
  });
});
