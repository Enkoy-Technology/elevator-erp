import type { DocumentAppendixContent } from '../../common/export/templates/commercial-document';
import type { DocumentContentProvider } from '../../common/export/document-content.provider';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../../common/decorators';
import type { DocumentPdfService } from '../../common/export/document-pdf.service';
import { setDownloadHeaders, singleRow, writeXlsx } from '../../common/export/tabular';
import type { TenantBrandingProvider } from '../../common/export/tenant-branding.provider';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ProformasController } from './proformas.controller';
import type { ProformasService } from './proformas.service';

jest.mock('../../common/export/tabular');
const mockWriteXlsx = jest.mocked(writeXlsx);
const mockSetDownloadHeaders = jest.mocked(setDownloadHeaders);
const mockSingleRow = jest.mocked(singleRow);

describe('ProformasController — role gating', () => {
  const reflector = new Reflector();

  it('leaves the document download open to any of the class-level read roles (no method-level override)', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      ProformasController.prototype.document,
    );
    expect(roles).toBeUndefined();
  });

  it('gates cancel to SALES_MANAGER, for comparison', () => {
    const roles = reflector.get<string[] | undefined>(
      ROLES_KEY,
      ProformasController.prototype.cancel,
    );
    expect(roles).toEqual(['GENERAL_MANAGER', 'SALES_MANAGER']);
  });
});

describe('ProformasController.document — format routing and filenames', () => {
  const user: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    role: 'SALES_MANAGER',
  };

  const row = {
    proformaNumber: 'PF-FY2026-27-0001',
    status: 'ISSUED',
    issuedAt: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: null,
    customerName: 'Acme',
    projectName: 'Bole Tower',
    technicalSpec: null,
    subtotalEtb: '100000.00',
    vatEtb: '15000.00',
    totalEtb: '115000.00',
  };

  const proformasService = {
    getDocumentData: jest.fn().mockResolvedValue(row),
  };
  const pdfService = { renderDocumentPdf: jest.fn() };
  const docxService = { renderDocumentDocx: jest.fn() };
  const tenantBranding = { get: jest.fn() };
  // Pages 3+ of the document. An empty appendix is the realistic default for
  // a tenant that has not filled its boilerplate in yet.
  const documentContent = {
    get: jest.fn<Promise<DocumentAppendixContent>, [string]>(async () => ({
      boilerplate: [],
      components: [],
    })),
  };
  const branding = { name: 'Enkoy', slogan: '', logoUrl: null, address: '', phones: [], primaryColor: '#123456' };

  const res = { end: jest.fn() };

  const controller = new ProformasController(
    proformasService as unknown as ProformasService,
    pdfService as unknown as DocumentPdfService,
    docxService,
    tenantBranding as unknown as TenantBrandingProvider,
    documentContent as unknown as DocumentContentProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    proformasService.getDocumentData.mockResolvedValue(row);
    tenantBranding.get.mockResolvedValue(branding);
    mockSingleRow.mockImplementation((async function* (r: Record<string, unknown>) {
      yield r;
    }) as typeof singleRow);
  });

  it('rejects an unknown format with a 400 before touching the service', async () => {
    await expect(
      controller.document(user, 'id', 'csv', res as never),
    ).rejects.toThrow(BadRequestException);
    expect(proformasService.getDocumentData).not.toHaveBeenCalled();
  });

  it('format=pdf: renders via DocumentPdfService and writes proforma-<proformaNumber>.pdf headers', async () => {
    pdfService.renderDocumentPdf.mockResolvedValue(Buffer.from('%PDF'));

    await controller.document(user, 'id', 'pdf', res as never);

    expect(proformasService.getDocumentData).toHaveBeenCalledWith(user, 'id');
    expect(pdfService.renderDocumentPdf).toHaveBeenCalledWith(
      'proforma',
      expect.objectContaining({ proformaNumber: 'PF-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'proforma-PF-FY2026-27-0001',
      'pdf',
      'application/pdf',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('format=docx: renders via DocumentDocxService and writes the Word content type', async () => {
    docxService.renderDocumentDocx.mockResolvedValue(Buffer.from('PK'));

    await controller.document(user, 'id', 'docx', res as never);

    expect(docxService.renderDocumentDocx).toHaveBeenCalledWith(
      'proforma',
      expect.objectContaining({ proformaNumber: 'PF-FY2026-27-0001' }),
      branding,
    );
    expect(mockSetDownloadHeaders).toHaveBeenCalledWith(
      res,
      'proforma-PF-FY2026-27-0001',
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('PK'));
  });

  it('format=xlsx: streams via writeXlsx and never touches branding/pdf/docx', async () => {
    await controller.document(user, 'id', 'xlsx', res as never);

    expect(mockWriteXlsx).toHaveBeenCalledWith(
      res,
      'proforma-PF-FY2026-27-0001',
      expect.arrayContaining([expect.objectContaining({ key: 'proformaNumber' })]),
      expect.anything(),
    );
    expect(tenantBranding.get).not.toHaveBeenCalled();
    expect(pdfService.renderDocumentPdf).not.toHaveBeenCalled();
    expect(docxService.renderDocumentDocx).not.toHaveBeenCalled();
  });
});
