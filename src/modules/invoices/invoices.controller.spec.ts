import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import {
  arrayToAsyncIterable,
  setDownloadHeaders,
  singleRow,
  writeCsv,
  writeXlsx,
} from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { InvoicesController } from './invoices.controller';
import type { InvoicesService } from './invoices.service';

jest.mock('../../common/export/tabular');
const mockWriteCsv = jest.mocked(writeCsv);
const mockWriteXlsx = jest.mocked(writeXlsx);
const mockSetDownloadHeaders = jest.mocked(setDownloadHeaders);
const mockSingleRow = jest.mocked(singleRow);
const mockArrayToAsyncIterable = jest.mocked(arrayToAsyncIterable);
// Auto-mocked like writeCsv/writeXlsx above — give it a real (if trivial)
// AsyncGenerator back so `expect.anything()` on the 4th writeCsv/writeXlsx
// arg has something other than `undefined` to match.
mockArrayToAsyncIterable.mockImplementation(
   
  async function* () {},
);

describe('InvoicesController — role gating', () => {
  const reflector = new Reflector();

  it('class-level default is FINANCE, and mutation endpoints do not need a method-level override', () => {
    const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, InvoicesController);
    expect(classRoles).toEqual(['FINANCE']);

    for (const handler of [
      InvoicesController.prototype.convertToInvoice,
      InvoicesController.prototype.create,
      InvoicesController.prototype.list,
      InvoicesController.prototype.aging,
      InvoicesController.prototype.get,
      InvoicesController.prototype.document,
      InvoicesController.prototype.voidInvoice,
      InvoicesController.prototype.patchFiscal,
      InvoicesController.prototype.recordWithholding,
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
    agingReport: jest.fn(),
  };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const controller = new InvoicesController(
    invoicesService as unknown as InvoicesService,
    pdfService as never,
    docxService,
    tenantBranding as never,
  );
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

  it('rejects a malformed customerId with a 400 before touching the service', async () => {
    await expect(
      controller.list(user, res as never, undefined, 'not-a-uuid'),
    ).rejects.toThrow(BadRequestException);
    expect(invoicesService.list).not.toHaveBeenCalled();
  });

  it('no ?format=: calls service.list() and writes the paginated JSON result', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    invoicesService.list.mockResolvedValue(page);
    const customerId = '33333333-3333-4333-8333-333333333333';

    await controller.list(user, res as never, undefined, customerId, 'INV-1');

    expect(invoicesService.list).toHaveBeenCalledWith(user, {
      status: undefined,
      customerId,
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

describe('InvoicesController.aging — format routing', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const invoicesService = { agingReport: jest.fn() };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };
  const controller = new InvoicesController(
    invoicesService as unknown as InvoicesService,
    pdfService as never,
    docxService,
    tenantBranding as never,
  );
  const res = { json: jest.fn(), end: jest.fn() };
  const agingRows = [
    {
      customerId: 'cust-1',
      customerName: 'Acme',
      current: '0.00',
      d1_30: '60.00',
      d31_60: '0.00',
      d61_90: '0.00',
      d90_plus: '0.00',
      total: '60.00',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    invoicesService.agingReport.mockResolvedValue(agingRows);
    tenantBranding.get.mockResolvedValue(branding);
  });

  it('no ?format=: replies with the raw JSON bucket rows', async () => {
    await controller.aging(user, res as never, undefined);

    expect(invoicesService.agingReport).toHaveBeenCalledWith(user);
    expect(res.json).toHaveBeenCalledWith(agingRows);
    expect(mockWriteCsv).not.toHaveBeenCalled();
  });

  it('?format=csv: streams the bucket rows via writeCsv', async () => {
    await controller.aging(user, res as never, 'csv');

    expect(mockWriteCsv).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^aging-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'd90_plus' })]),
      expect.anything(),
    );
    expect(res.json).not.toHaveBeenCalled();
  });

  it('?format=xlsx: streams via writeXlsx', async () => {
    await controller.aging(user, res as never, 'xlsx');

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^aging-\d{4}-\d{2}-\d{2}$/),
      expect.arrayContaining([expect.objectContaining({ key: 'total' })]),
      expect.anything(),
    );
  });

  it('?format=pdf: renders via DocumentPdfService and writes aging-<date>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));

    await controller.aging(user, res as never, 'pdf');

    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'aging-report',
      expect.objectContaining({ rows: agingRows }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      expect.stringMatching(/^aging-\d{4}-\d{2}-\d{2}$/),
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(controller.aging(user, res as never, 'docx')).rejects.toThrow(
      /format must be one of/,
    );
    expect(invoicesService.agingReport).not.toHaveBeenCalled();
  });
});

describe('InvoicesController.document — format routing and filenames', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'FINANCE',
  };

  const row = {
    invoiceNumber: 'INV-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    dueDate: null,
    customerName: 'Acme',
    projectName: 'Bole Tower',
    lines: [],
    subtotalEtb: '100000.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
    whtEtb: '0.00',
    whtVoucherRef: null,
    fiscalReceiptNumber: null,
    fiscalDeviceSerial: null,
    fiscalIssuedAt: null,
    fiscalKind: null,
    fiscalNote: null,
  };

  const invoicesService = { getDocumentData: jest.fn() };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };
  const res = { end: jest.fn() };

  const controller = new InvoicesController(
    invoicesService as unknown as InvoicesService,
    pdfService as never,
    docxService,
    tenantBranding as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    invoicesService.getDocumentData.mockResolvedValue(row);
    tenantBranding.get.mockResolvedValue(branding);
    mockSingleRow.mockImplementation((async function* (r: Record<string, unknown>) {
      yield r;
    }) as typeof singleRow);
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(controller.document(user, 'id', 'csv-not-real', res as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(invoicesService.getDocumentData).not.toHaveBeenCalled();
  });

  it('format=pdf: renders via DocumentPdfService and writes invoice-<invoiceNumber>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));

    await controller.document(user, 'id', 'pdf', res as never);

    expect(invoicesService.getDocumentData).toHaveBeenCalledWith(user, 'id');
    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({ invoiceNumber: 'INV-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'invoice-INV-FY2026-27-0001',
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('format=docx: renders via DocumentDocxService and writes the Word content type', async () => {
    docxService.renderDocumentDocx.mockResolvedValue(Buffer.from('PK'));

    await controller.document(user, 'id', 'docx', res as never);

    expect(docxService.renderDocumentDocx).toHaveBeenCalledWith(
      'invoice',
      expect.objectContaining({ invoiceNumber: 'INV-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'invoice-INV-FY2026-27-0001',
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('PK'));
  });

  it('format=xlsx: streams via writeXlsx and never touches branding/pdf/docx', async () => {
    await controller.document(user, 'id', 'xlsx', res as never);

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      'invoice-INV-FY2026-27-0001',
      expect.arrayContaining([expect.objectContaining({ key: 'invoiceNumber' })]),
      expect.anything(),
    );
    expect(tenantBranding.get).not.toHaveBeenCalled();
    expect(pdfService.renderDocumentPdf).not.toHaveBeenCalled();
    expect(docxService.renderDocumentDocx).not.toHaveBeenCalled();
  });
});
